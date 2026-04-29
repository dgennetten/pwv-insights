<?php
/**
 * Sync t_member, t_report, and t_report_member from CSV exports into pwvinsights MySQL.
 *
 * The CSV files are produced by the AWS volunteer-management system; FK columns such as
 * GroupID, WksiteID, ReportWriterID, and PersonID are exported as display names rather
 * than numeric IDs.  This script resolves them via the lookup tables already in the DB.
 *
 * Usage:
 *   php db/sync-aws-csv.php [options]
 *
 * Options:
 *   --member=FILE        Path to tableT_member.csv      (default: db/tableT_member.csv)
 *   --report=FILE        Path to tableT_report.csv      (default: db/tableT_report.csv)
 *   --report-member=FILE Path to tableT_report_member.csv
 *   --dry-run            Parse + resolve without writing to DB
 *   --skip-member        Skip t_member import
 *   --skip-report        Skip t_report import
 *   --skip-report-member Skip t_report_member import
 *
 * CSV format produced by the AWS system:
 *   Row 1: metadata header ("Table: t_member", timestamp) — skipped
 *   Row 2: column names
 *   Row 3+: data
 */

define('DB_HOST', 'mysql.gennetten.com');
define('DB_NAME', 'pwvinsights');

$secretsFile = __DIR__ . '/../php/api/config.secret.php';
if (!file_exists($secretsFile)) {
    die("ERROR: config.secret.php not found at $secretsFile\n");
}
$secrets = include $secretsFile;
define('DB_USER', $secrets['db_user']);
define('DB_PASS', $secrets['db_pass']);

// ── CLI argument parsing ─────────────────────────────────────────────────────

$opts = [
    'member'        => __DIR__ . '/tableT_member.csv',
    'report'        => __DIR__ . '/tableT_report.csv',
    'report-member' => __DIR__ . '/tableT_report_member.csv',
    'dry-run'       => false,
    'skip-member'   => false,
    'skip-report'   => false,
    'skip-report-member' => false,
];

foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--dry-run')            { $opts['dry-run'] = true; continue; }
    if ($arg === '--skip-member')        { $opts['skip-member'] = true; continue; }
    if ($arg === '--skip-report')        { $opts['skip-report'] = true; continue; }
    if ($arg === '--skip-report-member') { $opts['skip-report-member'] = true; continue; }
    if (preg_match('/^--(\w[\w-]*)=(.+)$/', $arg, $m)) {
        if (array_key_exists($m[1], $opts)) {
            $opts[$m[1]] = $m[2];
        } else {
            die("Unknown option: $arg\n");
        }
    }
}

$dryRun = $opts['dry-run'];
if ($dryRun) {
    echo "[DRY RUN — no changes will be written]\n\n";
}
if (!$dryRun) {
    // Disable FK checks for the duration of the sync so that lookup-table
    // references (VisaTypeID, GenderID, etc.) don't block rows whose values
    // aren't in the local lu_* tables yet.  Re-enabled at the end.
    getDb()->exec('SET FOREIGN_KEY_CHECKS = 0');
}

// ── DB connection ────────────────────────────────────────────────────────────

function getDb(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

/**
 * Reads a CSV file exported by the AWS system.
 * Skips row 1 (metadata), uses row 2 as column names.
 * Returns array of associative rows.
 */
function readCsv(string $path): array {
    if (!file_exists($path)) {
        die("ERROR: CSV not found: $path\n");
    }
    $rows = [];
    $fh   = fopen($path, 'r');
    fgetcsv($fh, 0, ',', '"', ''); // skip metadata row
    $headers = fgetcsv($fh, 0, ',', '"', '');
    if (!$headers) {
        die("ERROR: No header row in $path\n");
    }
    while (($row = fgetcsv($fh, 0, ',', '"', '')) !== false) {
        if (count($row) !== count($headers)) continue;
        $rows[] = array_combine($headers, $row);
    }
    fclose($fh);
    return $rows;
}

/** Convert empty string to null; leave everything else as-is. */
function nullify(string $v): ?string {
    return $v === '' ? null : $v;
}

// ── Lookup-table reverse maps ────────────────────────────────────────────────

/**
 * Builds a display-name → ID map from a lookup table.
 * $keyCol is the PK; $nameCol is the display name column.
 */
function buildLookup(string $table, string $keyCol, string $nameCol): array {
    try {
        $rows = getDb()->query("SELECT `$keyCol`, `$nameCol` FROM `$table`")->fetchAll();
    } catch (PDOException $e) {
        echo "  WARN: Could not load lookup table `$table`: {$e->getMessage()}\n";
        return [];
    }
    $map = [];
    foreach ($rows as $r) {
        if ($r[$nameCol] !== null) {
            $map[$r[$nameCol]] = $r[$keyCol];
        }
    }
    return $map;
}

echo "Loading lookup tables...\n";
$lookups = [
    // CSV column name    => buildLookup(table, PK, name-col)
    'GroupID'        => buildLookup('lu_group',          'GroupID',        'GroupAbbrev'),
    'ActTypeID'      => buildLookup('lu_activity_type',  'ActTypeID',      'ActTypeName'),
    'WksiteID'       => buildLookup('lu_worksite',       'WksiteID',       'WksiteName'),
    'TrngTypeID'     => buildLookup('lu_trng_type',      'TrngTypeID',     'TrngTypeName'),
    'ActMethodID'    => buildLookup('lu_activity_method','ActMethodID',    'ActMethodName'),
    'ReviewStatusID' => buildLookup('lu_review_status',  'ReviewStatusID', 'ReviewStatusName'),
    'DeviceTypeID'   => buildLookup('lu_devicetype',     'DeviceTypeID',   'DeviceTypeName'),
    'GenderID'       => buildLookup('lu_gender',         'GenderID',       'GenderName'),
    'AgeID'          => buildLookup('lu_age',            'AgeID',          'AgeName'),
];

/**
 * Resolve a "Last, First" name to a PersonID.
 * Prefers the member with the most t_report_member rows (most active), then highest PersonID.
 * Caches results to avoid repeated DB hits.
 */
$nameCache = [];

function resolvePersonName(string $nameStr): ?int {
    global $nameCache;
    if (isset($nameCache[$nameStr])) return $nameCache[$nameStr];

    // Format: "LastName, FirstName"
    $comma = strpos($nameStr, ', ');
    if ($comma === false) {
        // Fallback: try whole string as LastName
        $last  = $nameStr;
        $first = '%';
    } else {
        $last  = substr($nameStr, 0, $comma);
        $first = substr($nameStr, $comma + 2);
    }

    $stmt = getDb()->prepare(
        'SELECT m.PersonID
         FROM   t_member m
         WHERE  m.LastName = ? AND m.FirstName = ?
         ORDER BY (SELECT COUNT(*) FROM t_report_member rm WHERE rm.PersonID = m.PersonID) DESC,
                  m.PersonID DESC
         LIMIT 1'
    );
    $stmt->execute([$last, $first]);
    $id = $stmt->fetchColumn();
    $result = ($id !== false) ? (int)$id : null;
    $nameCache[$nameStr] = $result;
    return $result;
}

function resolveId(string $colName, string $value): ?int {
    global $lookups;
    // "None" in TrngTypeID means no training type — matches NULL in the DB, not ID=0.
    // (lu_trng_type has ID=0 named "None" but reports with no training export as "None" too.)
    if ($value === '' || $value === 'None') {
        return null;
    }
    if ($value === '') return null;
    return isset($lookups[$colName][$value]) ? (int)$lookups[$colName][$value] : null;
}

// ── t_member ─────────────────────────────────────────────────────────────────

if (!$opts['skip-member']) {
    echo "Processing t_member ({$opts['member']})...\n";
    $rows = readCsv($opts['member']);
    $inserted = $updated = $skipped = 0;

    // Build upsert — all 22 AWS columns; never touch last_login_at
    $sql = '
        INSERT INTO t_member
          (PersonID, FirstName, MiddleInitial, LastName, NameSuffix, Username,
           EmailAddress, GenderID, BirthDate, AgeID, BirthYear, IsUSCitizen,
           VisaTypeID, IsVeteran, HasDisability, KnownMedical, RisksReviewed,
           Photo, ProfileLastChecked, DeviceTypeID, DeviceCode, IsBackpacker)
        VALUES
          (:PersonID, :FirstName, :MiddleInitial, :LastName, :NameSuffix, :Username,
           :EmailAddress, :GenderID, :BirthDate, :AgeID, :BirthYear, :IsUSCitizen,
           :VisaTypeID, :IsVeteran, :HasDisability, :KnownMedical, :RisksReviewed,
           :Photo, :ProfileLastChecked, :DeviceTypeID, :DeviceCode, :IsBackpacker)
        ON DUPLICATE KEY UPDATE
          FirstName        = VALUES(FirstName),
          MiddleInitial    = VALUES(MiddleInitial),
          LastName         = VALUES(LastName),
          NameSuffix       = VALUES(NameSuffix),
          Username         = VALUES(Username),
          EmailAddress     = VALUES(EmailAddress),
          GenderID         = VALUES(GenderID),
          BirthDate        = VALUES(BirthDate),
          AgeID            = VALUES(AgeID),
          BirthYear        = VALUES(BirthYear),
          IsUSCitizen      = VALUES(IsUSCitizen),
          VisaTypeID       = VALUES(VisaTypeID),
          IsVeteran        = VALUES(IsVeteran),
          HasDisability    = VALUES(HasDisability),
          KnownMedical     = VALUES(KnownMedical),
          RisksReviewed    = VALUES(RisksReviewed),
          Photo            = VALUES(Photo),
          ProfileLastChecked = VALUES(ProfileLastChecked),
          DeviceTypeID     = VALUES(DeviceTypeID),
          DeviceCode       = VALUES(DeviceCode),
          IsBackpacker     = VALUES(IsBackpacker)
          -- last_login_at intentionally omitted — local-only column
    ';

    $stmt = $dryRun ? null : getDb()->prepare($sql);

    foreach ($rows as $r) {
        $pid = (int)$r['PersonID'];
        if ($pid < 1) { $skipped++; continue; }
        if (($r['FirstName'] ?? '') === '') { $skipped++; continue; } // FirstName NOT NULL

        $params = [
            ':PersonID'          => $pid,
            ':FirstName'         => nullify($r['FirstName']),
            ':MiddleInitial'     => nullify($r['MiddleInitial']),
            ':LastName'          => nullify($r['LastName']),
            ':NameSuffix'        => nullify($r['NameSuffix']),
            ':Username'          => nullify($r['Username']),
            ':EmailAddress'      => nullify($r['EmailAddress']),
            ':GenderID'          => resolveId('GenderID',     $r['GenderID']),
            ':BirthDate'         => nullify($r['BirthDate']),
            ':AgeID'             => resolveId('AgeID',        $r['AgeID']),
            ':BirthYear'         => nullify($r['BirthYear']),
            ':IsUSCitizen'       => $r['IsUSCitizen'] !== '' ? (int)$r['IsUSCitizen'] : null,
            ':VisaTypeID'        => null, // lu_visa_type incomplete locally; not used by this app
            ':IsVeteran'         => $r['IsVeteran'] !== '' ? (int)$r['IsVeteran'] : null,
            ':HasDisability'     => $r['HasDisability'] !== '' ? (int)$r['HasDisability'] : null,
            ':KnownMedical'      => $r['KnownMedical'] !== '' ? (int)$r['KnownMedical'] : null,
            ':RisksReviewed'     => $r['RisksReviewed'] !== '' ? (int)$r['RisksReviewed'] : null,
            ':Photo'             => nullify($r['Photo']),
            ':ProfileLastChecked'=> nullify($r['ProfileLastChecked']),
            ':DeviceTypeID'      => resolveId('DeviceTypeID', $r['DeviceTypeID']),
            ':DeviceCode'        => nullify($r['DeviceCode']),
            ':IsBackpacker'      => $r['IsBackpacker'] !== '' ? (int)$r['IsBackpacker'] : null,
        ];

        if ($dryRun) {
            $inserted++;
        } else {
            $stmt->execute($params);
            $rc = $stmt->rowCount();
            if ($rc === 1)      $inserted++;
            elseif ($rc === 2)  $updated++;
            // rowCount()=0 means no change (existing row matched exactly)
        }
    }
    echo "  t_member: $inserted inserted, $updated updated, $skipped skipped.\n";
}

// ── t_report ──────────────────────────────────────────────────────────────────

if (!$opts['skip-report']) {
    echo "Processing t_report ({$opts['report']})...\n";
    $rows = readCsv($opts['report']);
    $inserted = $updated = $skipped = $warn = 0;

    $sql = '
        INSERT INTO t_report
          (ReportID, GroupID, ActTypeID, WksiteID, ActivityDate, TrngTypeID,
           ActMethodID, NumGuests, ReportDate, ReportWriterID, TimeStarted, TimeEnded,
           StartMile, FinishMile, PatrolExtent, TravelMinutes, NumContacted,
           TrailConditions, Comment, ScheduleID, IsDraft, IsUnofficial, ReviewStatusID)
        VALUES
          (:ReportID, :GroupID, :ActTypeID, :WksiteID, :ActivityDate, :TrngTypeID,
           :ActMethodID, :NumGuests, :ReportDate, :ReportWriterID, :TimeStarted, :TimeEnded,
           :StartMile, :FinishMile, :PatrolExtent, :TravelMinutes, :NumContacted,
           :TrailConditions, :Comment, :ScheduleID, :IsDraft, :IsUnofficial, :ReviewStatusID)
        ON DUPLICATE KEY UPDATE
          GroupID         = VALUES(GroupID),
          ActTypeID       = VALUES(ActTypeID),
          WksiteID        = VALUES(WksiteID),
          ActivityDate    = VALUES(ActivityDate),
          TrngTypeID      = VALUES(TrngTypeID),
          ActMethodID     = VALUES(ActMethodID),
          NumGuests       = VALUES(NumGuests),
          ReportDate      = VALUES(ReportDate),
          ReportWriterID  = VALUES(ReportWriterID),
          TimeStarted     = VALUES(TimeStarted),
          TimeEnded       = VALUES(TimeEnded),
          StartMile       = VALUES(StartMile),
          FinishMile      = VALUES(FinishMile),
          PatrolExtent    = VALUES(PatrolExtent),
          TravelMinutes   = VALUES(TravelMinutes),
          NumContacted    = VALUES(NumContacted),
          TrailConditions = VALUES(TrailConditions),
          Comment         = VALUES(Comment),
          ScheduleID      = VALUES(ScheduleID),
          IsDraft         = VALUES(IsDraft),
          IsUnofficial    = VALUES(IsUnofficial),
          ReviewStatusID  = VALUES(ReviewStatusID)
    ';

    $stmt = $dryRun ? null : getDb()->prepare($sql);

    foreach ($rows as $r) {
        $rid = (int)$r['ReportID'];
        if ($rid < 1) { $skipped++; continue; }

        // Resolve name-substituted FK columns
        $writerName = $r['ReportWriterID'];
        $writerId   = $writerName !== '' ? resolvePersonName($writerName) : null;
        if ($writerName !== '' && $writerId === null) {
            echo "  WARN: Could not resolve ReportWriterID '$writerName' for ReportID=$rid\n";
            $warn++;
        }

        $params = [
            ':ReportID'       => $rid,
            ':GroupID'        => resolveId('GroupID',     $r['GroupID']),
            ':ActTypeID'      => resolveId('ActTypeID',   $r['ActTypeID']),
            ':WksiteID'       => resolveId('WksiteID',    $r['WksiteID']),
            ':ActivityDate'   => nullify($r['ActivityDate']),
            ':TrngTypeID'     => resolveId('TrngTypeID',  $r['TrngTypeID']),
            ':ActMethodID'    => resolveId('ActMethodID', $r['ActMethodID']),
            ':NumGuests'      => $r['NumGuests'] !== '' ? (int)$r['NumGuests'] : null,
            ':ReportDate'     => nullify($r['ReportDate']),
            ':ReportWriterID' => $writerId,
            ':TimeStarted'    => nullify($r['TimeStarted']),
            ':TimeEnded'      => nullify($r['TimeEnded']),
            ':StartMile'      => $r['StartMile'] !== '' ? (float)$r['StartMile'] : null,
            ':FinishMile'     => $r['FinishMile'] !== '' ? (float)$r['FinishMile'] : null,
            ':PatrolExtent'   => nullify($r['PatrolExtent']),
            ':TravelMinutes'  => $r['TravelMinutes'] !== '' ? (int)$r['TravelMinutes'] : null,
            ':NumContacted'   => $r['NumContacted'] !== '' ? (int)$r['NumContacted'] : null,
            ':TrailConditions'=> nullify($r['TrailConditions']),
            ':Comment'        => nullify($r['Comment']),
            ':ScheduleID'     => $r['ScheduleID'] !== '' ? (int)$r['ScheduleID'] : null,
            ':IsDraft'        => $r['IsDraft'] !== '' ? (int)$r['IsDraft'] : null,
            ':IsUnofficial'   => $r['IsUnofficial'] !== '' ? (int)$r['IsUnofficial'] : null,
            ':ReviewStatusID' => resolveId('ReviewStatusID', $r['ReviewStatusID'] ?? ''),
        ];

        if ($dryRun) {
            $inserted++;
        } else {
            $stmt->execute($params);
            $rc = $stmt->rowCount();
            if ($rc === 1)      $inserted++;
            elseif ($rc === 2)  $updated++;
        }
    }
    echo "  t_report: $inserted inserted, $updated updated, $skipped skipped, $warn name-resolution warnings.\n";
}

// ── t_report_member ───────────────────────────────────────────────────────────

if (!$opts['skip-report-member']) {
    echo "Processing t_report_member ({$opts['report-member']})...\n";
    $rows = readCsv($opts['report-member']);
    $inserted = $updated = $skipped = $warn = 0;

    $sql = '
        INSERT INTO t_report_member
          (ReportID, PersonID, IsMentor, TimeStarted, TimeEnded, ActMethodID, TravelMinutes)
        VALUES
          (:ReportID, :PersonID, :IsMentor, :TimeStarted, :TimeEnded, :ActMethodID, :TravelMinutes)
        ON DUPLICATE KEY UPDATE
          IsMentor      = VALUES(IsMentor),
          TimeStarted   = VALUES(TimeStarted),
          TimeEnded     = VALUES(TimeEnded),
          ActMethodID   = VALUES(ActMethodID),
          TravelMinutes = VALUES(TravelMinutes)
    ';

    $stmt = $dryRun ? null : getDb()->prepare($sql);

    foreach ($rows as $r) {
        $rid = (int)$r['ReportID'];
        if ($rid < 1) { $skipped++; continue; }

        $personName = $r['PersonID'];
        $personId   = $personName !== '' ? resolvePersonName($personName) : null;
        if ($personName !== '' && $personId === null) {
            echo "  WARN: Could not resolve PersonID '$personName' for ReportID=$rid\n";
            $warn++;
            $skipped++;
            continue;
        }

        $params = [
            ':ReportID'      => $rid,
            ':PersonID'      => $personId,
            ':IsMentor'      => $r['IsMentor'] !== '' ? (int)$r['IsMentor'] : null,
            ':TimeStarted'   => nullify($r['TimeStarted']),
            ':TimeEnded'     => nullify($r['TimeEnded']),
            ':ActMethodID'   => $r['ActMethodID'] !== '' ? (int)$r['ActMethodID'] : null,
            ':TravelMinutes' => $r['TravelMinutes'] !== '' ? (int)$r['TravelMinutes'] : null,
        ];

        if ($dryRun) {
            $inserted++;
        } else {
            try {
                $stmt->execute($params);
                $rc = $stmt->rowCount();
                if ($rc === 1)      $inserted++;
                elseif ($rc === 2)  $updated++;
            } catch (PDOException $e) {
                echo "  WARN: Skipping row (ReportID=$rid, PersonID=$personId): {$e->getMessage()}\n";
                $skipped++;
            }
        }
    }
    echo "  t_report_member: $inserted inserted, $updated updated, $skipped skipped, $warn name-resolution warnings.\n";
}

// ── Update sync watermark and restore FK checks ───────────────────────────────

if (!$dryRun) {
    try {
        getDb()->exec(
            "INSERT INTO app_sync_meta (id, last_successful_pull_at, last_pull_attempt_at)
             VALUES (1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               last_successful_pull_at = NOW(),
               last_pull_attempt_at    = NOW(),
               last_pull_error         = NULL,
               pending_after_session_at = NULL"
        );
        echo "\napp_sync_meta.last_successful_pull_at updated.\n";
    } catch (Throwable $e) {
        echo "\nWARN: Could not update app_sync_meta: {$e->getMessage()}\n";
    }

    getDb()->exec('SET FOREIGN_KEY_CHECKS = 1');
}

echo "\nDone.\n";

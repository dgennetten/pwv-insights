import { Link } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-lg bg-white dark:bg-stone-900 p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-6">
            Privacy Policy
          </h1>
          
          <div className="prose prose-stone dark:prose-invert max-w-none">
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
              Last updated: October 14, 2026
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Overview
              </h2>
              <p className="text-stone-700 dark:text-stone-300">
                PWV Insights is an analytics dashboard and patrol data logger for Poudre Wilderness 
                Volunteers (PWV). This privacy policy explains how we collect, use, and protect your 
                personal information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Information We Collect
              </h2>
              
              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mt-4 mb-2">
                Personal Information
              </h3>
              <ul className="list-disc pl-6 text-stone-700 dark:text-stone-300 space-y-2">
                <li><strong>Email Address:</strong> Used for authentication and communication</li>
                <li><strong>Name:</strong> Member name from the PWV roster</li>
                <li><strong>Member ID:</strong> PWV member identification number</li>
              </ul>

              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mt-4 mb-2">
                Location Data
              </h3>
              <p className="text-stone-700 dark:text-stone-300 mb-2">
                The Data Logger feature collects precise location information (GPS coordinates) when 
                you record a patrol track. This data is used to:
              </p>
              <ul className="list-disc pl-6 text-stone-700 dark:text-stone-300 space-y-2">
                <li>Track trail coverage and patrol routes</li>
                <li>Calculate distance traveled and on-trail statistics</li>
                <li>Generate patrol reports with location data</li>
                <li>Display your patrol path on maps</li>
              </ul>
              <p className="text-stone-700 dark:text-stone-300 mt-2">
                Location data is only collected when you actively start a patrol track. On Android, 
                the app uses a foreground service with a persistent notification to continue recording 
                your location even when the screen is off.
              </p>

              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mt-4 mb-2">
                Photos
              </h3>
              <p className="text-stone-700 dark:text-stone-300">
                Photos you capture during patrols are uploaded to our server and included in patrol 
                reports. Photos may contain embedded metadata (EXIF data) including location and 
                timestamp.
              </p>

              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mt-4 mb-2">
                Patrol Activity Data
              </h3>
              <p className="text-stone-700 dark:text-stone-300">
                We collect information about your patrol activities, including:
              </p>
              <ul className="list-disc pl-6 text-stone-700 dark:text-stone-300 space-y-2">
                <li>Date and time of patrols</li>
                <li>Trails patrolled</li>
                <li>Trees cleared and maintenance work performed</li>
                <li>Violations observed</li>
                <li>Encounters with hikers, dogs, and other trail users</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                How We Use Your Information
              </h2>
              <p className="text-stone-700 dark:text-stone-300">
                Your information is used to:
              </p>
              <ul className="list-disc pl-6 text-stone-700 dark:text-stone-300 space-y-2">
                <li>Provide access to the PWV Insights dashboard</li>
                <li>Generate patrol reports and analytics</li>
                <li>Track trail maintenance and coverage</li>
                <li>Communicate about PWV activities</li>
                <li>Improve the app and its features</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Data Sharing
              </h2>
              <p className="text-stone-700 dark:text-stone-300">
                Your data is shared only with:
              </p>
              <ul className="list-disc pl-6 text-stone-700 dark:text-stone-300 space-y-2">
                <li><strong>PWV Leadership:</strong> Patrol reports and analytics are shared with PWV coordinators and leadership</li>
                <li><strong>Other PWV Members:</strong> Some information (patrol schedules, leaderboards) is visible to other members</li>
              </ul>
              <p className="text-stone-700 dark:text-stone-300 mt-3">
                We do not sell, rent, or share your personal information with third parties for 
                marketing purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Data Security
              </h2>
              <p className="text-stone-700 dark:text-stone-300">
                All data is transmitted over encrypted connections (HTTPS). We store data on secure 
                servers hosted by DreamHost. While we take reasonable measures to protect your data, 
                no internet transmission is 100% secure.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Data Retention
              </h2>
              <p className="text-stone-700 dark:text-stone-300">
                We retain your patrol data and personal information for as long as you are an active 
                PWV member. Historical patrol data is retained indefinitely for organizational records 
                and analytics purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Your Rights
              </h2>
              <p className="text-stone-700 dark:text-stone-300 mb-2">
                You have the right to:
              </p>
              <ul className="list-disc pl-6 text-stone-700 dark:text-stone-300 space-y-2">
                <li>Access your personal data</li>
                <li>Request corrections to your personal data</li>
                <li>Request deletion of your account and data</li>
                <li>Opt out of certain data collection features</li>
              </ul>
              <p className="text-stone-700 dark:text-stone-300 mt-3">
                To exercise these rights, please visit our{' '}
                <Link to="/account-deletion" className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
                  Account Deletion
                </Link>{' '}
                page or contact us at the email below.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Children's Privacy
              </h2>
              <p className="text-stone-700 dark:text-stone-300">
                PWV Insights is not intended for use by children under 13. We do not knowingly 
                collect personal information from children.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Changes to This Policy
              </h2>
              <p className="text-stone-700 dark:text-stone-300">
                We may update this privacy policy from time to time. We will notify you of any 
                significant changes by email or through the app.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                Contact Us
              </h2>
              <p className="text-stone-700 dark:text-stone-300">
                If you have questions about this privacy policy or your data, please contact:
              </p>
              <p className="text-stone-700 dark:text-stone-300 mt-2">
                <strong>Email:</strong>{' '}
                <a 
                  href="mailto:douglas@gennetten.org" 
                  className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  douglas@gennetten.org
                </a>
              </p>
            </section>
          </div>

          <div className="mt-8 pt-6 border-t border-stone-200 dark:border-stone-800">
            <Link 
              to="/" 
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              ← Back to PWV Insights
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

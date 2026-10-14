import { Link } from 'react-router-dom'
import { useState } from 'react'

export default function AccountDeletionPage() {
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-lg bg-white dark:bg-stone-900 p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-6">
            Account & Data Deletion Request
          </h1>
          
          {!submitted ? (
            <div className="prose prose-stone dark:prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                  Before You Request Deletion
                </h2>
                <p className="text-stone-700 dark:text-stone-300 mb-3">
                  Please note that PWV Insights does not offer self-service account creation. 
                  Member accounts are provisioned based on the PWV volunteer roster.
                </p>
                <p className="text-stone-700 dark:text-stone-300 mb-3">
                  When you request account deletion, we will:
                </p>
                <ul className="list-disc pl-6 text-stone-700 dark:text-stone-300 space-y-2">
                  <li>Remove your login credentials and personal information</li>
                  <li>Anonymize your patrol reports (disassociate them from your name)</li>
                  <li>Retain anonymized patrol data for historical records and analytics</li>
                  <li>Delete all photos you've uploaded</li>
                </ul>
                <p className="text-stone-700 dark:text-stone-300 mt-3">
                  This process typically takes 5-7 business days to complete.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                  Request Deletion
                </h2>
                <p className="text-stone-700 dark:text-stone-300 mb-4">
                  To request deletion of your account and data, please contact us at:
                </p>
                
                <div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-6 mb-6">
                  <p className="text-stone-900 dark:text-stone-100 font-medium mb-2">
                    Email:
                  </p>
                  <a 
                    href="mailto:douglas@gennetten.org?subject=PWV%20Insights%20-%20Account%20Deletion%20Request" 
                    className="text-lg text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                  >
                    douglas@gennetten.org
                  </a>
                  <p className="text-sm text-stone-600 dark:text-stone-400 mt-3">
                    Subject: PWV Insights - Account Deletion Request
                  </p>
                </div>

                <p className="text-stone-700 dark:text-stone-300 mb-3">
                  Please include the following information in your request:
                </p>
                <ul className="list-disc pl-6 text-stone-700 dark:text-stone-300 space-y-2">
                  <li>Your full name</li>
                  <li>The email address associated with your account</li>
                  <li>Your PWV member ID (if known)</li>
                  <li>Confirmation that you want all your data deleted</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-3">
                  Alternative: Quick Request Form
                </h2>
                <p className="text-stone-700 dark:text-stone-300 mb-4">
                  You can also use this form to submit your deletion request:
                </p>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label 
                      htmlFor="name" 
                      className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </div>
                  
                  <div>
                    <label 
                      htmlFor="email" 
                      className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </div>
                  
                  <div>
                    <label 
                      htmlFor="memberId" 
                      className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                    >
                      PWV Member ID (if known)
                    </label>
                    <input
                      type="text"
                      id="memberId"
                      className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                    />
                  </div>
                  
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="confirm"
                      required
                      className="mt-1 mr-2"
                    />
                    <label 
                      htmlFor="confirm" 
                      className="text-sm text-stone-700 dark:text-stone-300"
                    >
                      I confirm that I want to delete my account and all associated data. 
                      I understand that this action cannot be undone and that anonymized 
                      historical patrol data may be retained.
                    </label>
                  </div>
                  
                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition-colors"
                  >
                    Submit Deletion Request
                  </button>
                </form>
              </section>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900 mb-4">
                <svg 
                  className="w-8 h-8 text-emerald-600 dark:text-emerald-400" 
                  fill="none" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="2" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100 mb-3">
                Request Submitted
              </h2>
              <p className="text-stone-700 dark:text-stone-300 mb-6">
                Your deletion request has been received. We will contact you at the email 
                address provided within 5-7 business days to confirm and complete the deletion.
              </p>
              <Link 
                to="/" 
                className="inline-block px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors"
              >
                Return to PWV Insights
              </Link>
            </div>
          )}

          {!submitted && (
            <div className="mt-8 pt-6 border-t border-stone-200 dark:border-stone-800">
              <Link 
                to="/" 
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              >
                ← Back to PWV Insights
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

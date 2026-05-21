import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - Palate",
  description: "Privacy Policy for Palate, your AI-powered culinary assistant by Sage.",
};

export default function PrivacyPage() {
  const lastUpdated = "May 20, 2026";

  return (
    <div className="w-full flex-1 p-8 md:p-12 max-w-4xl mx-auto overflow-y-auto">
      <div className="mb-10">
        <Link
          href="/"
          className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors mb-4 inline-block"
        >
          ← Back to Palate
        </Link>
        <h1 className="text-4xl font-bold text-white tracking-tight">Privacy Policy</h1>
        <p className="text-slate-400 mt-2 text-lg">Last updated: {lastUpdated}</p>
      </div>

      <div className="flex flex-col gap-8">
        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
          <p className="text-slate-300 leading-relaxed">
            Palate (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) is a personal, non-commercial
            culinary AI assistant operated by Donovan Everitt. This Privacy Policy explains how we
            collect, use, and protect your information when you use Palate at{" "}
            <span className="text-indigo-400">palate.goldhamster.box.ca</span>.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">2. Information We Collect</h2>
          <div className="flex flex-col gap-4 text-slate-300 leading-relaxed">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">2.1 Google Account Data</h3>
              <p>
                When you sign in with Google, we receive your <strong className="text-white">name</strong>,{" "}
                <strong className="text-white">email address</strong>, and{" "}
                <strong className="text-white">profile picture</strong> from your Google account. This
                data is used solely to identify your account within Palate.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">2.2 Google Calendar Data</h3>
              <p>
                If you choose to enable Google Calendar Sync, Palate requests access to your Google
                Calendar via the <code className="text-fuchsia-400 bg-black/30 px-1.5 py-0.5 rounded">
                calendar</code> scope. This permission is used exclusively to create, update, and
                delete meal plan events in a calendar you select. We do not read or access any
                pre-existing calendar events unrelated to Palate.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">2.3 User-Generated Content</h3>
              <p>
                Recipes, meal plans, chat sessions with Sage (our AI assistant), and culinary
                preferences you create within Palate are stored in our database to provide the
                service.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">2.4 API Keys</h3>
              <p>
                If you provide a Google Gemini API key for AI features, it is encrypted using{" "}
                <strong className="text-white">AES-256-GCM</strong> before storage. The plaintext key
                is never stored or logged.
              </p>
            </div>
          </div>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside text-slate-300 leading-relaxed flex flex-col gap-2">
            <li>Authenticate your identity and maintain your session</li>
            <li>Store and display your recipes, meal plans, and AI chat history</li>
            <li>Synchronize meal schedules to your Google Calendar (only when you enable this feature)</li>
            <li>Query the USDA FoodData Central API for nutritional information on your behalf</li>
            <li>Process AI requests through the Google Gemini API using your provided key</li>
            <li>Remember your display preferences (measurement system, calendar settings)</li>
          </ul>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">4. Data Storage &amp; Security</h2>
          <div className="text-slate-300 leading-relaxed flex flex-col gap-3">
            <p>
              Your data is stored in a PostgreSQL database on a server hosted by{" "}
              <strong className="text-white">Whatbox.ca</strong> in Canada. We implement the
              following security measures:
            </p>
            <ul className="list-disc list-inside flex flex-col gap-2 ml-2">
              <li>API keys are encrypted with AES-256-GCM with unique initialization vectors</li>
              <li>Google OAuth tokens are stored securely and refreshed automatically</li>
              <li>All connections to the app are served over HTTPS</li>
              <li>Content Security Policy headers restrict resource loading</li>
              <li>Rate limiting is applied to API endpoints</li>
            </ul>
          </div>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">5. Third-Party Services</h2>
          <div className="text-slate-300 leading-relaxed flex flex-col gap-3">
            <p>Palate integrates with the following third-party services:</p>
            <ul className="list-disc list-inside flex flex-col gap-2 ml-2">
              <li>
                <strong className="text-white">Google OAuth 2.0</strong> — for authentication
              </li>
              <li>
                <strong className="text-white">Google Calendar API</strong> — for optional meal plan synchronization
              </li>
              <li>
                <strong className="text-white">Google Gemini API</strong> — for AI-powered recipe synthesis and analysis
              </li>
              <li>
                <strong className="text-white">USDA FoodData Central</strong> — for deterministic nutritional data
              </li>
            </ul>
            <p>
              Each of these services has its own privacy policy. We encourage you to review them.
              We do not sell, share, or transfer your data to any other third parties.
            </p>
          </div>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">6. Data Retention &amp; Deletion</h2>
          <p className="text-slate-300 leading-relaxed">
            Your data is retained for as long as your account exists. You may request deletion of
            your account and all associated data at any time by contacting{" "}
            <a
              href="mailto:armyworkbs@gmail.com"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              armyworkbs@gmail.com
            </a>
            . Upon deletion, all personal data, recipes, chat history, and stored tokens will be
            permanently removed from our systems.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">7. Google API Services User Data Policy</h2>
          <p className="text-slate-300 leading-relaxed">
            Palate&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We only use Google user data to provide and
            improve the features you explicitly enable. We do not use Google user data for serving
            advertisements, and we do not allow humans to read your data unless required for
            security purposes, to comply with applicable law, or with your affirmative consent.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">8. Children&apos;s Privacy</h2>
          <p className="text-slate-300 leading-relaxed">
            Palate is not directed at children under the age of 13. We do not knowingly collect
            personal information from children. If you believe a child has provided us with
            personal data, please contact us and we will delete it promptly.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">9. Changes to This Policy</h2>
          <p className="text-slate-300 leading-relaxed">
            We may update this Privacy Policy from time to time. Any changes will be reflected on
            this page with an updated &quot;Last updated&quot; date. Continued use of Palate after
            changes constitutes acceptance of the revised policy.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">10. Contact</h2>
          <p className="text-slate-300 leading-relaxed">
            For any questions or concerns regarding this Privacy Policy or your data, please
            contact:
          </p>
          <div className="mt-4 bg-black/20 p-4 rounded-2xl border border-white/5">
            <p className="text-white font-semibold">Donovan Everitt</p>
            <a
              href="mailto:armyworkbs@gmail.com"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              armyworkbs@gmail.com
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

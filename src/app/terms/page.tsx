import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - Palate",
  description: "Terms of Service for Palate, your AI-powered culinary assistant by Sage.",
};

export default function TermsPage() {
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
        <h1 className="text-4xl font-bold text-white tracking-tight">Terms of Service</h1>
        <p className="text-slate-400 mt-2 text-lg">Last updated: {lastUpdated}</p>
      </div>

      <div className="flex flex-col gap-8">
        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
          <p className="text-slate-300 leading-relaxed">
            By accessing or using Palate (&quot;the app&quot;) at{" "}
            <span className="text-indigo-400">palate.goldhamster.box.ca</span>, you agree to be
            bound by these Terms of Service. If you do not agree to these terms, please do not use
            the app. Palate is operated by Donovan Everitt as a personal, non-commercial project.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">2. Description of Service</h2>
          <p className="text-slate-300 leading-relaxed">
            Palate is an AI-powered culinary assistant featuring recipe management, meal planning,
            nutritional analysis, zero-waste guidance, and optional Google Calendar integration. The
            app&apos;s AI persona, Sage 🌿, provides culinary advice using Google Gemini AI models
            and USDA nutritional data.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">3. User Accounts</h2>
          <div className="text-slate-300 leading-relaxed flex flex-col gap-3">
            <p>
              Palate uses Google OAuth 2.0 for authentication. By signing in, you authorize us to
              access your basic Google profile information (name, email, profile picture).
            </p>
            <p>
              You are responsible for maintaining the security of your Google account. You agree not
              to share your account access or use Palate for any unauthorized purpose.
            </p>
          </div>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">4. Google Calendar Integration</h2>
          <p className="text-slate-300 leading-relaxed">
            Palate offers optional Google Calendar synchronization to push your meal plans to a
            calendar of your choice. By enabling this feature, you grant Palate permission to
            create, update, and delete calendar events on your behalf. You may revoke this
            permission at any time through your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              Google Account permissions
            </a>{" "}
            or by disabling the feature in Palate Settings.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">5. User-Generated Content</h2>
          <div className="text-slate-300 leading-relaxed flex flex-col gap-3">
            <p>
              You retain ownership of all recipes, meal plans, and content you create within
              Palate. By using the service, you grant us a limited license to store, process, and
              display your content solely for the purpose of providing the service to you.
            </p>
            <p>
              You agree not to upload content that is illegal, harmful, or infringes on the
              intellectual property rights of others.
            </p>
          </div>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">6. AI-Generated Content Disclaimer</h2>
          <div className="text-slate-300 leading-relaxed flex flex-col gap-3">
            <p>
              Sage, Palate&apos;s AI assistant, generates culinary suggestions, recipes, and
              nutritional analyses using AI models. While we strive for accuracy:
            </p>
            <ul className="list-disc list-inside flex flex-col gap-2 ml-2">
              <li>AI-generated content may contain inaccuracies or errors</li>
              <li>Nutritional estimates are approximations and should not replace professional dietary advice</li>
              <li>Sage does not provide medical, dietary, or allergen advice — consult a healthcare professional for medical nutrition needs</li>
              <li>Always verify ingredient safety, especially regarding allergies and dietary restrictions</li>
            </ul>
          </div>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">7. API Keys &amp; Third-Party Services</h2>
          <p className="text-slate-300 leading-relaxed">
            Palate allows you to provide your own Google Gemini API key for AI features. You are
            responsible for any usage charges incurred through your API key. Palate encrypts your
            key at rest but is not liable for costs resulting from your use of the service. You
            should monitor your API usage through Google AI Studio.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">8. Availability &amp; Modifications</h2>
          <div className="text-slate-300 leading-relaxed flex flex-col gap-3">
            <p>
              Palate is provided on an &quot;as is&quot; and &quot;as available&quot; basis. As a
              personal project, we do not guarantee uninterrupted availability. We reserve the
              right to modify, suspend, or discontinue any part of the service at any time without
              prior notice.
            </p>
          </div>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">9. Limitation of Liability</h2>
          <p className="text-slate-300 leading-relaxed">
            To the fullest extent permitted by law, Palate and its operator shall not be liable for
            any indirect, incidental, special, consequential, or punitive damages arising from your
            use of the service, including but not limited to data loss, dietary decisions made
            based on AI suggestions, or API usage charges.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">10. Termination</h2>
          <p className="text-slate-300 leading-relaxed">
            You may stop using Palate at any time. You may request deletion of your account and
            all associated data by contacting{" "}
            <a
              href="mailto:armyworkbs@gmail.com"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              armyworkbs@gmail.com
            </a>
            . We reserve the right to suspend or terminate accounts that violate these terms.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-4">11. Changes to These Terms</h2>
          <p className="text-slate-300 leading-relaxed">
            We may update these Terms of Service from time to time. Changes will be reflected on
            this page with an updated &quot;Last updated&quot; date. Continued use of Palate after
            changes constitutes acceptance of the revised terms.
          </p>
        </section>

        <section className="glass-panel p-8 rounded-3xl border border-white/5 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">12. Contact</h2>
          <p className="text-slate-300 leading-relaxed">
            For any questions regarding these Terms of Service, please contact:
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

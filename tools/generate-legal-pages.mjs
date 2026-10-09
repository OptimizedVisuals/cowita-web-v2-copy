/**
 * CoWiTa legal/policy page generator.
 *
 * Generates the /legal/*.html pages from a shared page shell so every policy
 * page stays consistent. Run with:  node tools/generate-legal-pages.mjs
 *
 * All content is a DRAFT for Richard (client) to review, amend and approve
 * before launch. Items needing an organisational decision are marked
 * "[RICHARD TO CONFIRM]".
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'legal');

const DRAFT_BANNER = `
      <div class="legal-draft" role="note">
        <strong>DRAFT — not yet approved.</strong>
        This page is a working draft prepared for Richard (CoWiTa) to review,
        amend and approve. It must be signed off before the site goes live.
        Items marked <em>[RICHARD TO CONFIRM]</em> need an organisational
        decision.
      </div>`;

function page({ slug, title, description, updated, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${title} | CoWiTa</title>

  <meta
    name="description"
    content="${description}"
  >

  <link rel="canonical" href="https://cowita.org/legal/${slug}.html">
  <link rel="stylesheet" href="/css/styles.css">
  <script src="/js/main.js" defer></script>
</head>
<body>

  <a class="skip-link" href="#main-content">
    Skip to main content
  </a>

  <div id="site-header"></div>

  <main id="main-content">

    <section class="legal-hero">
      <div class="container">
        <p class="section-label">Legal &amp; policies</p>
        <h1>${title}</h1>
        <p class="legal-updated">Last updated: ${updated}</p>
      </div>
    </section>

    <section class="section legal-body">
      <div class="container legal-prose">
${DRAFT_BANNER}
${body}
        <nav class="legal-index" aria-label="All CoWiTa policies">
          <h2>All CoWiTa policies</h2>
          <ul>
            <li><a href="/legal/privacy.html">Privacy Policy</a></li>
            <li><a href="/legal/terms.html">Terms of Service</a></li>
            <li><a href="/legal/cookies.html">Cookie Policy</a></li>
            <li><a href="/legal/safeguarding.html">Safeguarding Policy</a></li>
            <li><a href="/legal/child-protection.html">Child Protection Policy</a></li>
            <li><a href="/legal/code-of-conduct.html">Code of Conduct</a></li>
            <li><a href="/legal/complaints.html">Complaints Procedure</a></li>
            <li><a href="/legal/data-retention.html">Data Retention Policy</a></li>
            <li><a href="/legal/accessibility.html">Accessibility Statement</a></li>
          </ul>
        </nav>
      </div>
    </section>

  </main>

  <div id="site-footer"></div>

</body>
</html>
`;
}

const pages = [];

/* ---------------------------------------------------------------- privacy */
pages.push(
  page({
    slug: 'privacy',
    title: 'Privacy Policy',
    description:
      'How CoWiTa collects, uses, stores and protects personal information, including information about children and young people.',
    updated: '9 October 2026',
    body: `        <h2>1. Who we are</h2>
        <p>
          CoWiTa is a creative talent and opportunity organisation.
          [RICHARD TO CONFIRM: registered legal name, company/charity number,
          registered address, and the identity of the data controller.]
          For any privacy question, contact us at
          <a href="mailto:info@cowita.org">info@cowita.org</a>.
        </p>

        <h2>2. Who this policy covers</h2>
        <p>
          This policy covers everyone whose personal information we collect
          through this website and our programmes, including children and
          young people under 18, parents and guardians, mentors, volunteers,
          partner organisations and supporters.
        </p>

        <h2>3. What we collect and why</h2>
        <p>We collect only what we need for the purpose you are contacting us about.</p>
        <ul>
          <li><strong>Contact and enquiry forms:</strong> name, email, phone (optional), message.</li>
          <li><strong>Talent and learning forms:</strong> name, age or date of birth, email, phone, location, discipline, experience and availability.</li>
          <li><strong>Mentor, partner, collaboration and support forms:</strong> name, organisation, role, email, phone, and your message or offer of support.</li>
          <li><strong>Technical and security data:</strong> a hashed form of your IP address, your browser user agent and the time of submission, used to protect the forms from spam and abuse.</li>
        </ul>
        <p>
          [RICHARD TO CONFIRM: the full list of data points, the lawful basis
          for each (consent, legitimate interests, contract, legal obligation)
          and the retention period per category.]
        </p>

        <h2>4. Children and young people</h2>
        <p>
          Where a form is completed by or for someone under 18, we ask for
          confirmation that a parent or guardian has read this policy and
          agreed to the submission. We do not ask children for more
          information than the programme requires, and we never publish a
          child's personal details, images or work without separate written
          consent from a parent or guardian.
        </p>
        <p>
          See our <a href="/legal/child-protection.html">Child Protection Policy</a>
          and <a href="/legal/safeguarding.html">Safeguarding Policy</a>.
        </p>

        <h2>5. How we use information</h2>
        <ul>
          <li>To reply to your enquiry and send you a confirmation email.</li>
          <li>To assess expression-of-interest, mentor, partner and support submissions.</li>
          <li>To deliver and improve CoWiTa programmes and keep in touch about them.</li>
          <li>To keep our services safe, prevent abuse, and meet legal duties.</li>
        </ul>
        <p>We do not sell personal information, and we do not use it for advertising.</p>

        <h2>6. Who we share it with</h2>
        <p>
          We uses carefully selected service providers (processors) to run this
          site and the programmes: website hosting, database storage, email
          delivery, spam protection and error monitoring. Each processor acts
          only on our instructions. [RICHARD TO CONFIRM: named processors,
          their locations and whether a Data Processing Agreement is in place.]
        </p>
        <p>We may also share information where the law requires it, or where there is a safeguarding concern (see the Safeguarding Policy).</p>

        <h2>7. How long we keep it</h2>
        <p>
          We keep information only as long as we need it. Current periods are
          set out in the <a href="/legal/data-retention.html">Data Retention Policy</a>.
          After that, information is deleted or anonymised.
        </p>

        <h2>8. Your rights</h2>
        <p>
          You can ask to see the information we hold about you, ask us to
          correct or delete it, withdraw consent, or object to how we use it.
          Email <a href="mailto:info@cowita.org">info@cowita.org</a> and we
          will respond within one month. If you are unhappy with our answer,
          you can complain to the UK Information Commissioner's Office
          (ICO) at ico.org.uk — [RICHARD TO CONFIRM: confirm this is correct].
        </p>

        <h2>9. Keeping information safe</h2>
        <p>
          Submissions are sent over an encrypted connection and stored in a
          restricted database. Access is limited to the small number of staff
          and volunteers who need it, protected by individual accounts with
          two-factor authentication. If a breach occurs that risks your
          rights, we will tell you and the ICO as required.
        </p>

        <h2>10. Cookies</h2>
        <p>
          See the <a href="/legal/cookies.html">Cookie Policy</a> for what is
          stored on your device and how to control it.
        </p>

        <h2>11. Changes to this policy</h2>
        <p>
          We will update this page when our practices change and show the new
          date at the top.
        </p>`,
  })
);

/* ------------------------------------------------------------------ terms */
pages.push(
  page({
    slug: 'terms',
    title: 'Terms of Service',
    description:
      'The terms that apply when you use the CoWiTa website, submit information through our forms, or take part in our programmes.',
    updated: '9 October 2026',
    body: `        <h2>1. About these terms</h2>
        <p>
          By using this website you agree to these terms. [RICHARD TO CONFIRM:
          legal entity name and governing jurisdiction.]
        </p>

        <h2>2. Using this website</h2>
        <p>
          You agree to use the site lawfully, not to attempt to break or
          overload it, not to submit false or misleading information, and not
          to upload anything harmful. We may suspend or withdraw access if
          these terms are broken.
        </p>

        <h2>3. Submitting information</h2>
        <p>
          The forms on this site are an expression of interest. Sending a form
          does not create a contract, a place on a programme, funding or a
          partnership, and does not guarantee a reply other than our
          acknowledgement email.
        </p>
        <p>
          Applicants under 18 must have a parent or guardian confirm the
          submission, as explained in the
          <a href="/legal/privacy.html">Privacy Policy</a>.
        </p>

        <h2>4. Content on this site</h2>
        <p>
          Text, images, logos and design belong to CoWiTa or are used with
          permission. You may not copy or republish them without written
          permission. [RICHARD TO CONFIRM: copyright statement and any
          third-party credits.]
        </p>

        <h2>5. Links to other sites</h2>
        <p>
          We are not responsible for the content or privacy practices of
          external sites we link to.
        </p>

        <h2>6. Availability</h2>
        <p>
          We try to keep the site available and accurate but we do not promise
          it will be uninterrupted or error-free.
        </p>

        <h2>7. Our responsibility to you</h2>
        <p>
          Nothing in these terms limits our liability for death or personal
          injury caused by negligence, for fraud, or for anything else the law
          does not allow us to limit. [RICHARD TO CONFIRM: liability position
          with your legal adviser.]
        </p>

        <h2>8. Changes</h2>
        <p>
          We may update these terms; the current version always appears on
          this page.
        </p>

        <h2>9. Contact</h2>
        <p>
          Questions about these terms:
          <a href="mailto:info@cowita.org">info@cowita.org</a>.
        </p>`,
  })
);

/* ---------------------------------------------------------------- cookies */
pages.push(
  page({
    slug: 'cookies',
    title: 'Cookie Policy',
    description:
      'What cookies and similar storage CoWiTa uses on this website, why, and how you can control them.',
    updated: '9 October 2026',
    body: `        <h2>1. What cookies are</h2>
        <p>
          Cookies and similar technologies are small files a website stores on
          your device. They can remember your settings, keep a session secure,
          or measure how a site is used.
        </p>

        <h2>2. What we use</h2>
        <p>
          This site is built to work without advertising or tracking cookies.
        </p>
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Purpose</th><th>Duration</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Cloudflare Turnstile</td>
              <td>Strictly necessary / security</td>
              <td>Checks that a form submission comes from a real person and not a bot.</td>
              <td>Session — [RICHARD TO CONFIRM with provider]</td>
            </tr>
            <tr>
              <td>Authentication cookie (admin area only)</td>
              <td>Strictly necessary</td>
              <td>Keeps CoWiTa staff signed in to the submissions dashboard.</td>
              <td>Session</td>
            </tr>
            <tr>
              <td>Analytics</td>
              <td>Analytics</td>
              <td>
                Privacy-friendly, cookieless analytics (Plausible or Fathom)
                may be used to count visits. No personal data is stored and no
                cookie is set.
              </td>
              <td>n/a</td>
            </tr>
          </tbody>
        </table>
        <p>
          If we ever add a cookie that is not strictly necessary, we will ask
          for your consent first and you will be able to change your choice at
          any time.
        </p>

        <h2>3. Managing cookies</h2>
        <p>
          You can block or delete cookies in your browser settings. Blocking
          security cookies may stop the forms working.
        </p>

        <h2>4. Contact</h2>
        <p>
          Questions: <a href="mailto:info@cowita.org">info@cowita.org</a>.
        </p>`,
  })
);

/* ----------------------------------------------------------- safeguarding */
pages.push(
  page({
    slug: 'safeguarding',
    title: 'Safeguarding Policy',
    description:
      'CoWiTa commitment to safeguarding children, young people and adults at risk across all our work.',
    updated: '9 October 2026',
    body: `        <h2>1. Our commitment</h2>
        <p>
          CoWiTa believes every child, young person and adult at risk has the
          right to take part in creative activity safely and to be protected
          from harm, abuse, neglect and exploitation. Safeguarding is
          everyone's responsibility.
        </p>

        <h2>2. Scope</h2>
        <p>
          This policy covers all CoWiTa staff, trustees, freelancers,
          volunteers, mentors and partner organisations working with us, and
          all our activities online and in person.
        </p>

        <h2>3. Roles and responsibilities</h2>
        <p>
          [RICHARD TO CONFIRM: named Designated Safeguarding Lead (DSL) and
          deputy, with contact details, plus who is responsible for trustee
          oversight.]
        </p>

        <h2>4. How we work safely</h2>
        <ul>
          <li>Safer recruitment, including references, for anyone working with young people.</li>
          <li>Enhanced criminal record checks where the role requires them. [RICHARD TO CONFIRM the screening standard that applies.]</li>
          <li>Code of conduct signed by all staff and volunteers (see the <a href="/legal/code-of-conduct.html">Code of Conduct</a>).</li>
          <li>No one-to-one unobserved contact between an adult and a young person.</li>
          <li>Clear rules for photography, video, messaging and social media contact.</li>
          <li>Consent from a parent or guardian for a child's participation, images and travel.</li>
          <li>Risk assessments for every activity and trip.</li>
        </ul>

        <h2>5. Recognising and responding to concerns</h2>
        <p>
          Anyone who has a concern about a child or adult at risk should
          report it immediately to the Designated Safeguarding Lead. If a
          child is in immediate danger, contact the emergency services (999)
          first. Concerns are recorded in writing the same day and handled
          confidentially; we do not investigate allegations ourselves.
        </p>

        <h2>6. Reporting to authorities</h2>
        <p>
          We refer concerns to the relevant local authority children's social
          care service, the police where a crime may have been committed, and
          the relevant regulator. [RICHARD TO CONFIRM: local safeguarding
          partners and reporting contacts.]
        </p>

        <h2>7. Training</h2>
        <p>
          All staff and volunteers complete safeguarding induction before
          starting, refresh their training at least annually, and know how to
          report a concern. [RICHARD TO CONFIRM: training provider and
          frequency.]
        </p>

        <h2>8. Record keeping</h2>
        <p>
          Safeguarding records are stored securely, separately from other
          records, with access limited to the DSL and those who need it.
          Retention follows the <a href="/legal/data-retention.html">Data Retention Policy</a>
          and statutory guidance.
        </p>

        <h2>9. Allegations against staff or volunteers</h2>
        <p>
          Allegations are taken seriously, reported to the DSL and, where
          required, to the relevant authorities and safeguarding partner, and
          managed without prejudice to a fair process.
        </p>

        <h2>10. Review</h2>
        <p>
          This policy is reviewed at least every 12 months, or sooner after
          any incident or change in the law. [RICHARD TO CONFIRM review
          owner and date of first approval.]
        </p>`,
  })
);

/* ------------------------------------------------------ child protection */
pages.push(
  page({
    slug: 'child-protection',
    title: 'Child Protection Policy',
    description:
      'How CoWiTa protects children and young people: consent, supervision, imagery, communication and reporting.',
    updated: '9 October 2026',
    body: `        <h2>1. Principles</h2>
        <ul>
          <li>The welfare of the child comes first.</li>
          <li>Children have a right to be heard, and to be taken seriously.</li>
          <li>All children, whatever their background, are treated equally and with respect.</li>
          <li>Staff and volunteers work in an open, accountable way.</li>
        </ul>

        <h2>2. Consent and participation</h2>
        <p>
          A parent or guardian must consent before a child takes part in a
          CoWiTa activity or submits information through this website. Consent
          covers participation, emergency medical treatment, and (separately)
          photography and media.
        </p>

        <h2>3. Photography, video and media</h2>
        <ul>
          <li>Separate written parental consent is required for every image or video of a child.</li>
          <li>Consent covers the specific use and duration; it can be withdrawn at any time.</li>
          <li>We never publish a child's full name, school, address or contact details alongside an image.</li>
          <li>Children are photographed and filmed in a dignified way, never in a state of undress.</li>
        </ul>

        <h2>4. Communication with young people</h2>
        <p>
          Digital contact with a young person happens through agreed channels,
          with a parent or guardian copied where appropriate. Personal mobile
          numbers and private social media accounts are not used. Any
          communication that makes a young person uncomfortable should be
          reported to the Designated Safeguarding Lead.
        </p>

        <h2>5. Supervision</h2>
        <p>
          [RICHARD TO CONFIRM: adult-to-child ratios and supervision rules per
          activity type.]
        </p>

        <h2>6. Online safety</h2>
        <p>
          Information children share with us through forms is held securely
          and used only for the programme they applied to, as described in the
          <a href="/legal/privacy.html">Privacy Policy</a>.
        </p>

        <h2>7. Reporting a concern</h2>
        <p>
          Concerns are reported to the Designated Safeguarding Lead
          immediately. Where there is a risk of immediate harm, contact the
          emergency services on 999. [RICHARD TO CONFIRM: named contacts and
          how this page will publish them.]
        </p>

        <h2>8. Related policies</h2>
        <p>
          Read this with the <a href="/legal/safeguarding.html">Safeguarding Policy</a>,
          <a href="/legal/code-of-conduct.html">Code of Conduct</a> and
          <a href="/legal/complaints.html">Complaints Procedure</a>.
        </p>`,
  })
);

/* ------------------------------------------------------- code of conduct */
pages.push(
  page({
    slug: 'code-of-conduct',
    title: 'Code of Conduct',
    description:
      'The standards of behaviour CoWiTa expects from staff, volunteers, mentors, participants and partners.',
    updated: '9 October 2026',
    body: `        <h2>1. Who this applies to</h2>
        <p>
          Everyone taking part in CoWiTa activity: staff, trustees,
          freelancers, volunteers, mentors, participants and partner
          organisations.
        </p>

        <h2>2. We all agree to</h2>
        <ul>
          <li>Treat everyone with respect, regardless of age, gender, disability, race, faith, sexuality or background.</li>
          <li>Put the safety and wellbeing of children and adults at risk first.</li>
          <li>Behave professionally and calmly, in person and online.</li>
          <li>Respect creative work and intellectual property.</li>
          <li>Follow CoWiTa's safeguarding, privacy and data rules.</li>
          <li>Declare any conflict of interest.</li>
          <li>Report concerns or wrongdoing promptly.</li>
        </ul>

        <h2>3. We never</h2>
        <ul>
          <li>Use bullying, harassment, discrimination, threats or violence.</li>
          <li>Develop inappropriate personal or romantic relationships with participants or young people.</li>
          <li>Share personal contact details with a young person outside agreed channels.</li>
          <li>Photograph or film a young person without consent.</li>
          <li>Take or share alcohol, drugs or any illegal substance at CoWiTa activity.</li>
          <li>Misuse CoWiTa's name, funds, accounts or data.</li>
        </ul>

        <h2>4. If the code is broken</h2>
        <p>
          Concerns are handled under the
          <a href="/legal/complaints.html">Complaints Procedure</a> and, where
          safeguarding is involved, referred to the Designated Safeguarding
          Lead and the relevant authority. [RICHARD TO CONFIRM: disciplinary
          process and who decides.]
        </p>

        <h2>5. Reporting</h2>
        <p>
          Report concerns to <a href="mailto:info@cowita.org">info@cowita.org</a>
          or directly to the Designated Safeguarding Lead.
          [RICHARD TO CONFIRM: named contacts.]
        </p>`,
  })
);

/* ------------------------------------------------------------ complaints */
pages.push(
  page({
    slug: 'complaints',
    title: 'Complaints Procedure',
    description:
      'How to raise a complaint or concern with CoWiTa, and how we will respond.',
    updated: '9 October 2026',
    body: `        <h2>1. What this covers</h2>
        <p>
          Any complaint about CoWiTa's services, staff, volunteers, partners
          or this website. Safeguarding concerns are handled under the
          <a href="/legal/safeguarding.html">Safeguarding Policy</a> and
          reported immediately.
        </p>

        <h2>2. How to complain</h2>
        <p>
          Email <a href="mailto:info@cowita.org">info@cowita.org</a> with
          &ldquo;Complaint&rdquo; in the subject line, or write to
          [RICHARD TO CONFIRM: postal address]. You can ask someone to
          complain on your behalf, or on a child's behalf.
        </p>

        <h2>3. What to include</h2>
        <ul>
          <li>Your name and how to contact you.</li>
          <li>What happened, and when.</li>
          <li>Who was involved.</li>
          <li>What outcome you are looking for.</li>
        </ul>

        <h2>4. How we respond</h2>
        <ul>
          <li><strong>Acknowledge</strong> within 5 working days.</li>
          <li><strong>Investigate</strong> and reply with findings within 20 working days.</li>
          <li><strong>Explain</strong> what we found and what we will change.</li>
        </ul>
        <p>
          [RICHARD TO CONFIRM: the timescales above and the person who
          handles complaints at each stage.]
        </p>

        <h2>5. If you are still unhappy</h2>
        <p>
          You can ask for the complaint to be reviewed by a trustee who was
          not involved, and, where applicable, you can refer the matter to the
          relevant charity or sector regulator. [RICHARD TO CONFIRM.]
        </p>

        <h2>6. Records</h2>
        <p>
          Complaints and outcomes are recorded confidentially and kept
          according to the <a href="/legal/data-retention.html">Data Retention Policy</a>.
        </p>`,
  })
);

/* -------------------------------------------------------- data retention */
pages.push(
  page({
    slug: 'data-retention',
    title: 'Data Retention Policy',
    description:
      'How long CoWiTa keeps personal information, why, and how it is deleted or anonymised.',
    updated: '9 October 2026',
    body: `        <h2>1. Purpose</h2>
        <p>
          We keep personal information only for as long as we need it. This
          policy sets out those periods and how deletion happens. The periods
          below are proposals and must be approved by Richard.
        </p>

        <h2>2. Retention schedule</h2>
        <table>
          <thead>
            <tr><th>Information</th><th>Retention</th><th>Then</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>General enquiries and contact messages</td>
              <td>12 months from last contact [RICHARD TO CONFIRM]</td>
              <td>Deleted</td>
            </tr>
            <tr>
              <td>Talent, learning and mentor expressions of interest</td>
              <td>24 months, or 12 months after the programme ends [RICHARD TO CONFIRM]</td>
              <td>Deleted or anonymised</td>
            </tr>
            <tr>
              <td>Partner, collaboration and supporter records</td>
              <td>Duration of the relationship plus 24 months [RICHARD TO CONFIRM]</td>
              <td>Deleted</td>
            </tr>
            <tr>
              <td>Parental/guardian consent records</td>
              <td>Until consent is withdrawn, then 12 months as evidence [RICHARD TO CONFIRM]</td>
              <td>Deleted</td>
            </tr>
            <tr>
              <td>Images and video of children</td>
              <td>Until consent is withdrawn, or the agreed period ends [RICHARD TO CONFIRM]</td>
              <td>Deleted</td>
            </tr>
            <tr>
              <td>Security logs (hashed IP, user agent, timestamp)</td>
              <td>90 days</td>
              <td>Deleted</td>
            </tr>
            <tr>
              <td>Safeguarding records</td>
              <td>As required by statutory guidance [RICHARD TO CONFIRM]</td>
              <td>Deleted</td>
            </tr>
          </tbody>
        </table>

        <h2>3. How deletion happens</h2>
        <p>
          Deletion runs on a schedule through a controlled script against the
          submissions database. Backups containing earlier copies are rotated
          out within 30 days. Where information is needed for statistics only,
          it is anonymised rather than kept identifiable.
        </p>

        <h2>4. Requests from the public</h2>
        <p>
          Anyone can ask us to delete their information sooner by emailing
          <a href="mailto:info@cowita.org">info@cowita.org</a>. We act within
          one month unless we are required by law to keep it.
        </p>

        <h2>5. Review</h2>
        <p>
          This schedule is reviewed yearly, and whenever the law or our
          programmes change.
        </p>`,
  })
);

/* --------------------------------------------------------- accessibility */
pages.push(
  page({
    slug: 'accessibility',
    title: 'Accessibility Statement',
    description:
      'CoWiTa aims to meet WCAG 2.1 AA. This statement explains what we have done and how to tell us about a barrier.',
    updated: '9 October 2026',
    body: `        <h2>1. Our commitment</h2>
        <p>
          CoWiTa wants everyone to be able to use this website, including
          people who use screen readers, keyboards, magnification or voice
          input. We aim to meet the Web Content Accessibility Guidelines
          (WCAG) 2.1 level AA.
        </p>

        <h2>2. What we have done</h2>
        <ul>
          <li>Semantic headings and landmarks on every page.</li>
          <li>Labels, hints and error messages linked to their form fields.</li>
          <li>An error summary with links to each problem field, and focus moved to it.</li>
          <li>Keyboard-operable navigation, menus and forms.</li>
          <li>Visible focus outlines and a skip-to-content link.</li>
          <li>Colour contrast checked against 4.5:1 for body text.</li>
          <li>Alternative text on meaningful images.</li>
        </ul>

        <h2>3. Known limitations</h2>
        <p>
          [RICHARD TO CONFIRM after the accessibility audit: list anything not
          yet fixed, with a date for fixing it, or state that there are no
          known limitations.]
        </p>

        <h2>4. Tell us about a barrier</h2>
        <p>
          If something is hard to use, email
          <a href="mailto:info@cowita.org">info@cowita.org</a> or use the
          <a href="/contact/">contact form</a>. Please tell us the page and
          what happened. We aim to reply within 5 working days and will offer
          the information in another format if needed.
        </p>

        <h2>5. Enforcement</h2>
        <p>
          [RICHARD TO CONFIRM: the regulator or escalation route that applies
          to your organisation.]
        </p>

        <h2>6. How this statement was prepared</h2>
        <p>
          Prepared by the CoWiTa development team using automated auditing
          tools and manual keyboard and screen-reader checks. Last reviewed:
          9 October 2026.
        </p>`,
  })
);

/* ------------------------------------------------------------ legal hub */
const hub = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Legal &amp; Policies | CoWiTa</title>

  <meta
    name="description"
    content="CoWiTa privacy, terms, cookie, safeguarding, child protection, code of conduct, complaints, retention and accessibility policies."
  >

  <link rel="canonical" href="https://cowita.org/legal/">
  <link rel="stylesheet" href="/css/styles.css">
  <script src="/js/main.js" defer></script>
</head>
<body>

  <a class="skip-link" href="#main-content">
    Skip to main content
  </a>

  <div id="site-header"></div>

  <main id="main-content">

    <section class="legal-hero">
      <div class="container">
        <p class="section-label">Legal &amp; policies</p>
        <h1>How CoWiTa works with your information</h1>
        <p class="legal-updated">Last updated: 9 October 2026</p>
      </div>
    </section>

    <section class="section legal-body">
      <div class="container legal-prose">
${DRAFT_BANNER}
        <p>
          These pages explain how CoWiTa protects the people who take part in
          our programmes and uses this website, including children and young
          people.
        </p>

        <div class="legal-card-grid">
          <a class="legal-card" href="/legal/privacy.html">
            <h2>Privacy Policy</h2>
            <p>What we collect, why, and your rights.</p>
          </a>
          <a class="legal-card" href="/legal/terms.html">
            <h2>Terms of Service</h2>
            <p>The rules for using this website.</p>
          </a>
          <a class="legal-card" href="/legal/cookies.html">
            <h2>Cookie Policy</h2>
            <p>What is stored on your device.</p>
          </a>
          <a class="legal-card" href="/legal/safeguarding.html">
            <h2>Safeguarding Policy</h2>
            <p>How we keep people safe.</p>
          </a>
          <a class="legal-card" href="/legal/child-protection.html">
            <h2>Child Protection Policy</h2>
            <p>Consent, imagery and supervision for under-18s.</p>
          </a>
          <a class="legal-card" href="/legal/code-of-conduct.html">
            <h2>Code of Conduct</h2>
            <p>Behaviour we expect from everyone.</p>
          </a>
          <a class="legal-card" href="/legal/complaints.html">
            <h2>Complaints Procedure</h2>
            <p>How to raise a complaint and what happens next.</p>
          </a>
          <a class="legal-card" href="/legal/data-retention.html">
            <h2>Data Retention Policy</h2>
            <p>How long we keep information.</p>
          </a>
          <a class="legal-card" href="/legal/accessibility.html">
            <h2>Accessibility Statement</h2>
            <p>Our WCAG 2.1 AA commitment and how to report a barrier.</p>
          </a>
        </div>
      </div>
    </section>

  </main>

  <div id="site-footer"></div>

</body>
</html>
`;

mkdirSync(outDir, { recursive: true });

pages.forEach((html, index) => {
  const slug = [
    'privacy',
    'terms',
    'cookies',
    'safeguarding',
    'child-protection',
    'code-of-conduct',
    'complaints',
    'data-retention',
    'accessibility',
  ][index];
  writeFileSync(join(outDir, `${slug}.html`), html, 'utf8');
  console.log(`wrote legal/${slug}.html`);
});

writeFileSync(join(outDir, 'index.html'), hub, 'utf8');
console.log('wrote legal/index.html');

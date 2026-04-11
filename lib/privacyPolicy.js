// ═══════════════════════════════════════════════════════════════
//  PRIVACY POLICY
//  Edit sections and paragraphs here.
//  Changes appear instantly on /privacy — no other files needed.
// ═══════════════════════════════════════════════════════════════

const siteConfig = require('./config/site.js').default;

const PRIVACY_POLICY = [
  {
    title: '1. Information We Collect',
    paragraphs: [
      'We automatically collect certain technical information when you visit our site, including: IP address, browser type, device type, operating system, pages visited, referring URL, and time spent on the site.',
      'If you voluntarily complete a survey or form on this site, we collect the information you provide, which may include your name, email address, and phone number.',
      'We use your phone number solely to send a one-time SMS verification code to confirm your identity. We do not use your phone number for marketing calls or text messages beyond this verification step.',
    ],
  },
  {
    title: '2. How We Use Your Information',
    paragraphs: [
      'We use the information we collect to: operate and improve the site, verify your identity via SMS, respond to your inquiries, comply with legal obligations, and measure the effectiveness of our advertising campaigns.',
      'We do not sell your personal information to third parties.',
    ],
  },
  {
    title: '3. Cookies and Tracking Technologies',
    paragraphs: [
      'We use cookies and similar technologies for the following purposes:',
      'Essential cookies: session management, security tokens (CSRF protection), and storing your virtual coin balance locally. These are necessary for the site to function.',
      'Analytics and advertising cookies: with your consent, we use the Meta (Facebook) Pixel to measure ad performance, optimize advertising, and build audiences for future ads. The Meta Pixel may collect data such as your IP address, browser information, page views, and actions taken on the site. This data is shared with Meta Platforms, Inc. and processed according to Meta\'s Data Policy (https://www.facebook.com/privacy/policy/).',
      'You can manage your cookie preferences at any time using the cookie consent banner on this site. You can also disable cookies in your browser settings, though this may affect site functionality.',
    ],
  },
  {
    title: '4. Data Sharing',
    paragraphs: [
      'We may share your information with the following categories of third parties:',
      'Meta Platforms, Inc. (Facebook): when you consent to analytics cookies, the Meta Pixel shares browsing data with Meta for advertising measurement and optimization.',
      'Prelude (SMS verification provider): your phone number is shared with our verification provider solely to send a one-time verification code.',
      'We do not share your name, email, or phone number with advertisers or sell your data to any third party.',
    ],
  },
  {
    title: '5. Your Rights',
    paragraphs: [
      'Depending on your location, you may have the following rights regarding your personal data:',
      'Right to access: you can request a copy of the personal data we hold about you.',
      'Right to deletion: you can request that we delete your personal data. Contact us at the email below and we will process your request within 30 days.',
      'Right to correction: you can request that we correct inaccurate data.',
      'Right to opt out of tracking: you can withdraw cookie consent at any time using the cookie banner, or opt out of Meta tracking at https://www.facebook.com/help/568137493302217.',
      'California residents (CCPA): you have the right to know what data we collect, request deletion, and opt out of the sale of personal information. We do not sell personal information.',
      'EU/UK residents (GDPR): our legal basis for processing is consent (for cookies and surveys) and legitimate interest (for site security). You may lodge a complaint with your local data protection authority.',
    ],
  },
  {
    title: '6. Data Retention',
    paragraphs: [
      'We retain survey submissions and verification records for as long as necessary to fulfill the purposes described in this policy. You may request deletion at any time by contacting us.',
      'Rate-limiting and security logs are retained for up to 3 days and then automatically deleted.',
    ],
  },
  {
    title: '7. Data Security',
    paragraphs: [
      'We take reasonable technical and organizational measures to protect your information, including encryption in transit (HTTPS), secure cookie flags, and access controls. However, no system is completely secure.',
    ],
  },
  {
    title: '8. Children',
    paragraphs: [
      'This website is not intended for users under 18 years old. We do not knowingly collect data from minors. If you believe a minor has submitted data, contact us and we will delete it promptly.',
    ],
  },
  {
    title: '9. Changes to This Privacy Policy',
    paragraphs: [
      'We may update this policy at any time. Changes will be posted on this page with an updated effective date. Continued use of the site after changes constitutes acceptance.',
    ],
  },
  {
    title: '10. Contact',
    paragraphs: [
      `If you have questions about this Privacy Policy or wish to exercise your data rights, contact: ${siteConfig.EMAIL}`,
    ],
  },
];

module.exports = PRIVACY_POLICY;
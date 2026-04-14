// ═══════════════════════════════════════════════════════════════
//  TERMS & CONDITIONS
//  Edit sections and paragraphs here.
//  Changes appear instantly on /terms — no other files needed.
// ═══════════════════════════════════════════════════════════════

const siteConfig = require('./config/site.js').default;

const TERMS_AND_CONDITIONS = [
  {
    title: '1. Entertainment Only – No Real Money Gambling',
    paragraphs: [
      'This website provides free-to-play social casino style games for entertainment purposes only.',
      'No real money wagering is offered. No real money prizes are awarded. No items of value can be redeemed. All coins, credits, or points are virtual only.',
      'The games on this site are intended solely for recreational use.',
    ],
  },
  {
    title: '2. Virtual Coins',
    paragraphs: [
      'The site may provide virtual coins or credits for gameplay. These coins have no real-world value, cannot be exchanged for money, cannot be transferred, and cannot be redeemed for prizes.',
      'We may change, reset, or remove virtual coins at any time without notice.',
    ],
  },
  {
    title: '3. Age Requirement',
    paragraphs: [
      'You must be at least 21 years old to use this website. By using this site, you confirm that you are legally allowed to access this type of entertainment in your country.',
    ],
  },
  {
    title: '4. Data Collection and Surveys',
    paragraphs: [
      'This site may offer optional surveys that collect personal information such as your name, email address, and phone number. Participation is voluntary.',
      'Your phone number is used to send a one-time SMS verification code. We do not use your phone number for marketing purposes.',
      'By submitting this form you agree to the Privacy Policy and Terms and Conditions.',
    ],
  },
  {
    title: '5. Cookies and Advertising',
    paragraphs: [
      'This site uses essential cookies for security and functionality. With your consent, we also use advertising cookies (such as the Meta/Facebook Pixel) to measure the performance of our ads and improve your experience.',
      'You can manage your cookie preferences at any time via the cookie consent banner. For more details, see our Privacy Policy.',
    ],
  },
  {
    title: '6. No Guarantee of Availability',
    paragraphs: [
      'We do not guarantee that the website or games will always be available. We may modify, suspend, or stop the service at any time without notice.',
    ],
  },
  {
    title: '7. Third-Party Services',
    paragraphs: [
      'Some games or features may be provided by third-party providers. We also use third-party services for SMS verification and advertising measurement. We are not responsible for game results, errors, interruptions, or content from third parties.',
      'Third-party services operate under their own terms and privacy policies.',
    ],
  },
  {
    title: '8. Limitation of Liability',
    paragraphs: [
      'This website is provided "as is" without warranties of any kind. We are not responsible for loss of data, loss of coins, technical issues, or damages from using the site.',
    ],
  },
  {
    title: '9. Changes to Terms',
    paragraphs: [
      'We may update these Terms at any time. Continued use of the site after changes are posted constitutes acceptance of the updated Terms.',
    ],
  },
  {
    title: '10. Contact',
    paragraphs: [
      `If you have questions, contact us at: ${siteConfig.EMAIL}`,
    ],
  },
];

module.exports = TERMS_AND_CONDITIONS;
const nodemailer = require('nodemailer');

// ─── Helpers ────────────────────────────────────────────────────────────────

const LANG_DOMAINS = {
  en: 'https://www.serpsupport.com',
  fi: 'https://fi.serpsupport.com',
  nl: 'https://nl.serpsupport.com',
};

const getFrontendUrl = (language = 'en') => {
  if (process.env.NODE_ENV === 'production') {
    return LANG_DOMAINS[language] || LANG_DOMAINS.en;
  }
  // In development, always return the base configured URL
  return process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',')[0].trim().replace(/\/$/, '')
    : 'http://localhost:3000';
};

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Shared HTML wrapper for all emails
const emailWrapper = (content) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background-color: #f9f9f9; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="https://www.serpsupport.com/logo-email.png" alt="SerpSupport Logo" style="width: 80px; height: auto;" />
    </div>
    <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      ${content}
    </div>
    <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} SerpSupport. All rights reserved.</p>
    </div>
  </div>
`;

const ctaButton = (href, label) =>
  `<div style="text-align: center; margin-top: 30px;">
    <a href="${href}" style="display: inline-block; background-color: #00b899; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 16px;">${label}</a>
  </div>`;

const p = (text) =>
  `<p style="font-size: 16px; line-height: 1.6;">${text}</p>`;

const h1 = (text) =>
  `<h1 style="color: #00b899; font-size: 24px; margin-top: 0; text-align: center;">${text}</h1>`;

// Escapes free-text user input before it's interpolated into an HTML email body
const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ─── Translations ────────────────────────────────────────────────────────────

const emailTranslations = {
  // ── Welcome Email ──
  welcome: {
    en: {
      subject: 'Welcome to SerpSupport!',
      heading: (name) => `Welcome, ${name}! 🎉`,
      body1: 'Your account has been successfully created.',
      body2: "We're thrilled to have you join us at SerpSupport. If you have any questions or need help getting started, simply reply to this email.",
      cta: 'Go to Dashboard',
    },
    fi: {
      subject: 'Tervetuloa SerpSupportiin!',
      heading: (name) => `Tervetuloa, ${name}! 🎉`,
      body1: 'Tilisi on luotu onnistuneesti.',
      body2: 'Olemme iloisia, että liityit SerpSupportiin. Jos sinulla on kysyttävää tai tarvitset apua aloittamisessa, vastaa tähän sähköpostiin.',
      cta: 'Siirry kojelautaan',
    },
    nl: {
      subject: 'Welkom bij SerpSupport!',
      heading: (name) => `Welkom, ${name}! 🎉`,
      body1: 'Je account is succesvol aangemaakt.',
      body2: 'We zijn blij dat je bij SerpSupport bent. Als je vragen hebt of hulp nodig hebt om te beginnen, reageer dan gewoon op deze e-mail.',
      cta: 'Ga naar Dashboard',
    },
  },

  // ── New Match Email ──
  newMatch: {
    en: {
      subject: 'You have a new connection match! 🎉',
      heading: 'New Connection Match! 🔗',
      hi: (name) => `Hi ${name},`,
      body1: (roleText) => `We found a new match for you! You have been selected to <strong>${roleText}</strong>.`,
      body2: 'Please log in to your dashboard to review this connection and start the exchange process.',
      role: {
        give: (domain) => `give a backlink to ${domain}`,
        receive: (domain) => `receive a backlink from ${domain}`,
      },
      cta: 'View Connection',
    },
    fi: {
      subject: 'Sinulle löytyi uusi yhteyspari! 🎉',
      heading: 'Uusi yhteyspari löytyi! 🔗',
      hi: (name) => `Hei ${name},`,
      body1: (roleText) => `Löysimme sinulle uuden parin! Sinut on valittu <strong>${roleText}</strong>.`,
      body2: 'Kirjaudu kojelautaasi tarkastellaksesi tätä yhteyttä ja aloittaaksesi vaihdon.',
      role: {
        give: (domain) => `antamaan paluulinkki sivustolle ${domain}`,
        receive: (domain) => `vastaanottamaan paluulinkki sivustolta ${domain}`,
      },
      cta: 'Tarkastele yhteyttä',
    },
    nl: {
      subject: 'Je hebt een nieuwe verbindingsmatch! 🎉',
      heading: 'Nieuwe Verbindingsmatch! 🔗',
      hi: (name) => `Hallo ${name},`,
      body1: (roleText) => `We hebben een nieuwe match voor je gevonden! Je bent geselecteerd om <strong>${roleText}</strong>.`,
      body2: 'Log in op je dashboard om deze verbinding te bekijken en het uitwisselingsproces te starten.',
      role: {
        give: (domain) => `een backlink te geven aan ${domain}`,
        receive: (domain) => `een backlink te ontvangen van ${domain}`,
      },
      cta: 'Verbinding bekijken',
    },
  },

  // ── Connection Accepted Email ──
  connectionAccepted: {
    en: {
      subject: 'Your connection request was accepted! 🎉',
      heading: 'Connection Accepted! ✅',
      hi: (name) => `Hi ${name},`,
      body1: (domain) => `Great news! <strong>${domain}</strong> has accepted your connection request.`,
      body2: 'You can now start messaging them to organize your backlink exchange.',
      cta: 'Go to Inbox',
    },
    fi: {
      subject: 'Yhteyspyyntösi hyväksyttiin! 🎉',
      heading: 'Yhteys hyväksytty! ✅',
      hi: (name) => `Hei ${name},`,
      body1: (domain) => `Hienoja uutisia! <strong>${domain}</strong> hyväksyi yhteyspyyntösi.`,
      body2: 'Voit nyt aloittaa viestittelyn heidän kanssaan paluulinkkivaihdon järjestämiseksi.',
      cta: 'Siirry saapuneisiin',
    },
    nl: {
      subject: 'Je verbindingsverzoek is geaccepteerd! 🎉',
      heading: 'Verbinding geaccepteerd! ✅',
      hi: (name) => `Hallo ${name},`,
      body1: (domain) => `Geweldig nieuws! <strong>${domain}</strong> heeft je verbindingsverzoek geaccepteerd.`,
      body2: 'Je kunt nu berichten sturen om je backlinkuitwisseling te organiseren.',
      cta: 'Ga naar Postvak IN',
    },
  },

  // ── Password Reset Email ──
  passwordReset: {
    en: {
      subject: 'Reset your SerpSupport Password 🔒',
      heading: 'Password Reset Request 🔒',
      hi: (name) => `Hi ${name || 'there'},`,
      body1: "We received a request to reset the password for your SerpSupport account. If you didn't make this request, you can safely ignore this email.",
      body2: 'To set a new password, click the button below. This link will expire in <strong>1 hour</strong>.',
      cta: 'Reset Password',
      fallbackLabel: 'Or copy and paste this link into your browser:',
    },
    fi: {
      subject: 'Palauta SerpSupport-salasanasi 🔒',
      heading: 'Salasanan palautuspyyntö 🔒',
      hi: (name) => `Hei ${name || 'siellä'},`,
      body1: 'Saimme pyynnön palauttaa SerpSupport-tilisi salasana. Jos et tehnyt tätä pyyntöä, voit turvallisesti ohittaa tämän sähköpostin.',
      body2: 'Asettaaksesi uuden salasanan, napsauta alla olevaa painiketta. Tämä linkki vanhenee <strong>1 tunnin</strong> kuluttua.',
      cta: 'Palauta salasana',
      fallbackLabel: 'Tai kopioi ja liitä tämä linkki selaimeesi:',
    },
    nl: {
      subject: 'Reset je SerpSupport wachtwoord 🔒',
      heading: 'Wachtwoord reset verzoek 🔒',
      hi: (name) => `Hallo ${name || 'daar'},`,
      body1: "We hebben een verzoek ontvangen om het wachtwoord van je SerpSupport-account te resetten. Als je dit verzoek niet hebt gedaan, kun je deze e-mail veilig negeren.",
      body2: 'Klik op de onderstaande knop om een nieuw wachtwoord in te stellen. Deze link vervalt over <strong>1 uur</strong>.',
      cta: 'Wachtwoord resetten',
      fallbackLabel: 'Of kopieer en plak deze link in je browser:',
    },
  },

  // ── Subscription Active Email ──
  subscriptionActive: {
    en: {
      subject: 'Your payment was successful — welcome to SERPsupport Pro! 🎉',
      heading: 'Payment successful! 🎉',
      hi: (name) => `Hi ${name},`,
      body1: "Your payment went through and you're now subscribed to <strong>SERPsupport Pro</strong>.",
      body2: 'You have full access to sending messages, creating connections, and placing links.',
      cta: 'View Billing',
    },
    fi: {
      subject: 'Maksusi onnistui — tervetuloa SERPsupport Prohon! 🎉',
      heading: 'Maksu onnistui! 🎉',
      hi: (name) => `Hei ${name},`,
      body1: 'Maksusi meni läpi ja olet nyt tilannut <strong>SERPsupport Pro</strong> -tilauksen.',
      body2: 'Sinulla on täysi pääsy viestien lähettämiseen, yhteyksien luomiseen ja linkkien sijoittamiseen.',
      cta: 'Näytä laskutus',
    },
    nl: {
      subject: 'Je betaling is gelukt — welkom bij SERPsupport Pro! 🎉',
      heading: 'Betaling geslaagd! 🎉',
      hi: (name) => `Hallo ${name},`,
      body1: 'Je betaling is gelukt en je bent nu geabonneerd op <strong>SERPsupport Pro</strong>.',
      body2: 'Je hebt nu volledige toegang tot het versturen van berichten, het aangaan van verbindingen en het plaatsen van links.',
      cta: 'Bekijk facturering',
    },
  },

  // ── Admin Broadcast Email ──
  adminBroadcast: {
    en: {
      subjectPrefix: '📢 ',
      heading: 'New announcement from SerpSupport',
      hi: (name) => `Hi ${name},`,
      cta: 'Go to Dashboard',
    },
    fi: {
      subjectPrefix: '📢 ',
      heading: 'Uusi ilmoitus SerpSupportilta',
      hi: (name) => `Hei ${name},`,
      cta: 'Siirry kojelautaan',
    },
    nl: {
      subjectPrefix: '📢 ',
      heading: 'Nieuwe aankondiging van SerpSupport',
      hi: (name) => `Hallo ${name},`,
      cta: 'Ga naar Dashboard',
    },
  },

  // ── New Support Ticket Email (sent to admins) ──
  newTicket: {
    en: {
      subject: 'New support ticket submitted',
      heading: 'New support ticket 🎫',
      hi: (name) => `Hi ${name},`,
      body1: (submitterName, submitterEmail) => `<strong>${submitterName}</strong> (${submitterEmail}) just submitted a support ticket:`,
      cta: 'View in Admin Dashboard',
    },
    fi: {
      subject: 'Uusi tukipyyntö lähetetty',
      heading: 'Uusi tukipyyntö 🎫',
      hi: (name) => `Hei ${name},`,
      body1: (submitterName, submitterEmail) => `<strong>${submitterName}</strong> (${submitterEmail}) lähetti juuri tukipyynnön:`,
      cta: 'Näytä hallintapaneelissa',
    },
    nl: {
      subject: 'Nieuw supportticket ingediend',
      heading: 'Nieuw supportticket 🎫',
      hi: (name) => `Hallo ${name},`,
      body1: (submitterName, submitterEmail) => `<strong>${submitterName}</strong> (${submitterEmail}) heeft zojuist een supportticket ingediend:`,
      cta: 'Bekijk in Adminpaneel',
    },
  },

  // ── New Feedback Email (sent to admins) ──
  newFeedback: {
    en: {
      subject: 'New user feedback submitted',
      heading: 'New feedback 💬',
      hi: (name) => `Hi ${name},`,
      body1: (submitterName, submitterEmail, topic) => `<strong>${submitterName}</strong> (${submitterEmail}) just submitted new feedback (Topic: ${topic}):`,
      cta: 'View Feedback in Admin',
    },
    fi: {
      subject: 'Uusi käyttäjäpalaute lähetetty',
      heading: 'Uusi palaute 💬',
      hi: (name) => `Hei ${name},`,
      body1: (submitterName, submitterEmail, topic) => `<strong>${submitterName}</strong> (${submitterEmail}) lähetti juuri uuden palautteen (Aihe: ${topic}):`,
      cta: 'Näytä palaute hallintapaneelissa',
    },
    nl: {
      subject: 'Nieuwe gebruikersfeedback ingediend',
      heading: 'Nieuwe feedback 💬',
      hi: (name) => `Hallo ${name},`,
      body1: (submitterName, submitterEmail, topic) => `<strong>${submitterName}</strong> (${submitterEmail}) heeft zojuist nieuwe feedback ingediend (Onderwerp: ${topic}):`,
      cta: 'Bekijk feedback in Adminpaneel',
    },
  },
};

// ─── Email Functions ─────────────────────────────────────────────────────────

const sendWelcomeEmail = async (email, name, language = 'en') => {
  if (process.env.NODE_ENV !== 'production') return;
  const lang = ['en', 'fi', 'nl'].includes(language) ? language : 'en';
  const tr = emailTranslations.welcome[lang];
  const dashboardUrl = getFrontendUrl(lang);

  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: tr.subject,
      html: emailWrapper(`
        ${h1(tr.heading(name))}
        ${p(tr.body1)}
        ${p(tr.body2)}
        ${ctaButton(dashboardUrl, tr.cta)}
      `),
    });
    console.log('Welcome email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

const sendNewMatchEmail = async (email, name, isGiver, otherDomain, language = 'en') => {
  if (process.env.NODE_ENV !== 'production') return;
  const lang = ['en', 'fi', 'nl'].includes(language) ? language : 'en';
  const tr = emailTranslations.newMatch[lang];
  const roleText = isGiver ? tr.role.give(otherDomain) : tr.role.receive(otherDomain);
  const dashboardUrl = getFrontendUrl(lang);

  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: tr.subject,
      html: emailWrapper(`
        ${h1(tr.heading)}
        ${p(tr.hi(name))}
        ${p(tr.body1(roleText))}
        ${p(tr.body2)}
        ${ctaButton(dashboardUrl, tr.cta)}
      `),
    });
    console.log('Match email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending match email:', error);
  }
};

const sendConnectionAcceptedEmail = async (email, name, acceptedDomain, language = 'en') => {
  if (process.env.NODE_ENV !== 'production') return;
  const lang = ['en', 'fi', 'nl'].includes(language) ? language : 'en';
  const tr = emailTranslations.connectionAccepted[lang];
  const inboxUrl = `${getFrontendUrl(lang)}/inbox`;

  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: tr.subject,
      html: emailWrapper(`
        ${h1(tr.heading)}
        ${p(tr.hi(name))}
        ${p(tr.body1(acceptedDomain))}
        ${p(tr.body2)}
        ${ctaButton(inboxUrl, tr.cta)}
      `),
    });
    console.log('Connection accepted email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending connection accepted email:', error);
  }
};

const sendPasswordResetEmail = async (email, name, resetLink, language = 'en') => {
  // Always log the reset link to the console for dev visibility
  console.log(`\n========================================`);
  console.log(`[PASSWORD RESET LINK FOR ${email}]:`);
  console.log(`${resetLink}`);
  console.log(`========================================\n`);

  if (process.env.NODE_ENV !== 'production') return;
  const lang = ['en', 'fi', 'nl'].includes(language) ? language : 'en';
  const tr = emailTranslations.passwordReset[lang];

  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: tr.subject,
      html: emailWrapper(`
        ${h1(tr.heading)}
        ${p(tr.hi(name))}
        ${p(tr.body1)}
        ${p(tr.body2)}
        <div style="text-align: center; margin-top: 30px; margin-bottom: 20px;">
          <a href="${resetLink}" style="display: inline-block; background-color: #00b899; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(0,184,153,0.2);">${tr.cta}</a>
        </div>
        <p style="font-size: 14px; color: #777; line-height: 1.5; text-align: center;">
          ${tr.fallbackLabel}<br/>
          <a href="${resetLink}" style="color: #00b899; word-break: break-all;">${resetLink}</a>
        </p>
      `),
    });
    console.log('Password reset email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};

const sendSubscriptionActiveEmail = async (email, name, language = 'en') => {
  if (process.env.NODE_ENV !== 'production') return;
  const lang = ['en', 'fi', 'nl'].includes(language) ? language : 'en';
  const tr = emailTranslations.subscriptionActive[lang];
  const billingUrl = `${getFrontendUrl(lang)}/billing`;

  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: tr.subject,
      html: emailWrapper(`
        ${h1(tr.heading)}
        ${p(tr.hi(name))}
        ${p(tr.body1)}
        ${p(tr.body2)}
        ${ctaButton(billingUrl, tr.cta)}
      `),
    });
    console.log('Subscription active email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending subscription active email:', error);
  }
};

const sendAdminBroadcastEmail = async (email, name, title, description, language = 'en') => {
  if (process.env.NODE_ENV !== 'production') return;
  const lang = ['en', 'fi', 'nl'].includes(language) ? language : 'en';
  const tr = emailTranslations.adminBroadcast[lang];
  const dashboardUrl = getFrontendUrl(lang);
  // Strip newlines so free-text admin input can't inject extra mail headers via the subject
  const safeSubject = String(title).replace(/[\r\n]+/g, ' ');

  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${tr.subjectPrefix}${safeSubject}`,
      html: emailWrapper(`
        ${h1(tr.heading)}
        ${p(tr.hi(name))}
        <p style="font-size: 17px; font-weight: 700; margin-bottom: 4px;">${escapeHtml(title)}</p>
        <p style="font-size: 15px; line-height: 1.6; color: #444; white-space: pre-wrap;">${escapeHtml(description)}</p>
        ${ctaButton(dashboardUrl, tr.cta)}
      `),
    });
    console.log('Admin broadcast email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending admin broadcast email:', error);
  }
};

const sendNewTicketEmail = async (adminEmail, adminName, submitterName, submitterEmail, message, language = 'en') => {
  if (process.env.NODE_ENV !== 'production') return;
  const lang = ['en', 'fi', 'nl'].includes(language) ? language : 'en';
  const tr = emailTranslations.newTicket[lang];
  const dashboardUrl = `${getFrontendUrl(lang)}/admin/tickets`;

  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: tr.subject,
      html: emailWrapper(`
        ${h1(tr.heading)}
        ${p(tr.hi(adminName))}
        ${p(tr.body1(escapeHtml(submitterName), escapeHtml(submitterEmail)))}
        <blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #00b899; background: #f5f5f5; font-size: 15px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(message)}</blockquote>
        ${ctaButton(dashboardUrl, tr.cta)}
      `),
    });
    console.log('New ticket email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending new ticket email:', error);
  }
};

const sendNewFeedbackEmail = async (adminEmail, adminName, submitterName, submitterEmail, topic, message, language = 'en') => {
  if (process.env.NODE_ENV !== 'production') return;
  const lang = ['en', 'fi', 'nl'].includes(language) ? language : 'en';
  const tr = emailTranslations.newFeedback[lang];
  const dashboardUrl = `${getFrontendUrl(lang)}/admin/feedback`;

  try {
    const info = await transporter.sendMail({
      from: `"SerpSupport" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: tr.subject,
      html: emailWrapper(`
        ${h1(tr.heading)}
        ${p(tr.hi(adminName))}
        ${p(tr.body1(escapeHtml(submitterName), escapeHtml(submitterEmail), escapeHtml(topic)))}
        <blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #00b899; background: #f5f5f5; font-size: 15px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(message)}</blockquote>
        ${ctaButton(dashboardUrl, tr.cta)}
      `),
    });
    console.log('New feedback email sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending new feedback email:', error);
  }
};

module.exports = {
  sendWelcomeEmail,
  sendNewMatchEmail,
  sendConnectionAcceptedEmail,
  sendPasswordResetEmail,
  sendSubscriptionActiveEmail,
  sendAdminBroadcastEmail,
  sendNewTicketEmail,
  sendNewFeedbackEmail,
};

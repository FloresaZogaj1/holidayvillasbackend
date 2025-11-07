import { Router } from "express";
import nodemailer from "nodemailer";

const r = Router();

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'holidayvillas.ks@gmail.com',
    pass: process.env.EMAIL_PASS // Duhet të vendoset në .env file
  }
});

// Contact form endpoint
r.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, subject, message } = req.body;

    // Validations
    if (!firstName || !lastName || !email || !message) {
      return res.status(400).json({ 
        ok: false, 
        error: "Të gjitha fushat e detyrueshme duhet të plotësohen" 
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        ok: false, 
        error: "Email adresa nuk është e vlefshme" 
      });
    }

    // Email content
    const emailSubject = subject ? `[Holiday Villas Contact] ${subject}` : `[Holiday Villas Contact] Mesazh nga ${firstName} ${lastName}`;
    
    const emailHTML = `
      <h2>Mesazh i ri nga forma e kontaktit</h2>
      <p><strong>Emri:</strong> ${firstName} ${lastName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subjekti:</strong> ${subject || 'Nuk është përcaktuar'}</p>
      <hr>
      <h3>Mesazhi:</h3>
      <p>${message.replace(/\n/g, '<br>')}</p>
      <hr>
      <p><em>Ky mesazh u dërgua nga forma e kontaktit në Holiday Villas website.</em></p>
      <p><em>Data: ${new Date().toLocaleString('sq-AL')}</em></p>
    `;

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER || 'holidayvillas.ks@gmail.com',
      to: 'holidayvillas.ks@gmail.com', // Email ku dërgohen mesazhet
      subject: emailSubject,
      html: emailHTML,
      replyTo: email // Që të mund të përgjigjen direkt te klienti
    };

    await transporter.sendMail(mailOptions);

    res.json({ 
      ok: true, 
      message: "Mesazhi u dërgua me sukses! Do t'ju përgjigjemi sa më shpejt." 
    });

  } catch (error) {
    console.error('Contact form error:', error);
    
    // Different error messages based on error type
    if (error.code === 'EAUTH') {
      return res.status(500).json({ 
        ok: false, 
        error: "Problem me konfigurimin e email-it. Ju lutem kontaktoni administratorin." 
      });
    }
    
    res.status(500).json({ 
      ok: false, 
      error: "Një gabim i papritur ndodhi. Ju lutem provoni përsëri ose na kontaktoni direkt." 
    });
  }
});

export default r;
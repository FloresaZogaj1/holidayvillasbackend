# EMAIL SETUP INSTRUCTIONS / UDHËZIME PËR SETUP-IN E EMAIL-IT

## Hapat për të aktivizuar email functionality:

### 1. Gmail Setup (Për holidayvillas.ks@gmail.com)

**RECOMMENDED: Përdor App Password për Gmail**

1. Shko te Google Account Settings: https://myaccount.google.com/
2. Në "Security" seksionin, aktivo "2-Step Verification" nëse nuk është aktivizuar
3. Pasi të aktivizohet 2FA, shko te "App passwords"
4. Gjeneroj një App Password të re për "Holiday Villas Website"
5. Copy password-in e gjeneruar

### 2. Update .env file në backend:

```env
EMAIL_USER=holidayvillas.ks@gmail.com
EMAIL_PASS=your_16_character_app_password_here
```

**⚠️ IMPORTANT:** 
- Zëvendëso `your_16_character_app_password_here` me app password-in e gjeneruar nga Gmail
- MOS përdor password-in e zakonshëm të Gmail-it
- MOS publiko këto të dhëna në GitHub ose vende publike

### 3. Alternativa për Gmail (nëse App Password nuk funksionon):

Nëse Gmail krijon probleme, mund të përdorësh shërbime të tjera:

#### Outlook/Hotmail:
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=your_outlook_email@outlook.com
EMAIL_PASS=your_outlook_password
```

#### SendGrid (Profesional):
```env
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=your_sendgrid_api_key
EMAIL_FROM=noreply@holidayvillasks.com
```

### 4. Testing:

1. Restart backend server:
```bash
cd backend
npm start
```

2. Test forma e kontaktit në website
3. Kontrollo email-in për mesazhe të reja

### 5. Troubleshooting:

**Gabimi "Invalid login":**
- Sigurohu që përdor App Password, jo password-in e zakonshëm
- Kontrollo që 2FA është aktiv në Gmail

**Gabimi "Connection refused":**
- Kontrollo internet connection
- Provo me port 465 në vend të 587

**Gabimi "Authentication failed":**
- Rigjeneroj App Password të ri
- Sigurohu që EMAIL_USER është saktë

### 6. Production Setup:

Për production server (Render.com):
1. Shto environment variables në Render dashboard:
   - `EMAIL_USER=holidayvillas.ks@gmail.com`
   - `EMAIL_PASS=your_app_password`
2. Redeploy aplikacionin

### 7. Security Notes:

- MOS publikoj email credentials në kod
- Përdor gjithmonë App Passwords për Gmail
- Konsidero përdorimin e SendGrid ose shërbim tjetër profesional për production
- Monitor email usage për të evituar spam complaints

## Test Email Template:

Kur dikush dërgon mesazh nga forma, ju do të merrni email të formatuar kështu:

```
Subject: [Holiday Villas Contact] Subjekti i mesazhit

Mesazh i ri nga forma e kontaktit

Emri: John Doe
Email: john@example.com
Subjekti: Pyetje për rezervim

---
Mesazhi:
Përshëndetje, dua të pyes për disponueshmërinë...

---
Ky mesazh u dërgua nga forma e kontaktit në Holiday Villas website.
Data: 7/11/2025, 10:30:25
```
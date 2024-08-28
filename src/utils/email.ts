import nodemailer from 'nodemailer';

// Create a transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail', // or another email service
    auth: {
        user: process.env.EMAIL_SMTP_USER,
        pass: process.env.EMAIL_SMTP_PASS
    }
});

export async function sendmail(to: string, subject: string, text: string, html: string | undefined) {
    // Send email
    const mailOptions = {
        from: process.env.EMAIL_SMTP_FROM,
        to,
        subject,
        text,
        html
    };
    return new Promise<void>((resolve, reject) => {
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Message failed: %s', text);
                return reject(error);
            }
            console.log('Message sent: %s', info.messageId);
            resolve();
        })
    });
}

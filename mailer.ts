import nodemailer = require('nodemailer');
import * as config from './config.json';


export const sendSuccessEmail = () => {
    var mailOptions = {
        from: 'nzmattgrant@gmail.com',
        to: 'nzmattgrant@gmail.com',
        subject: 'Finished executing daily task',
        text: `Job done`
    };
    sendMail(mailOptions);
}


export const sendErrorEmail = (errorMessage: string) => {
    var mailOptions = {
        from: 'nzmattgrant@gmail.com',
        to: 'nzmattgrant@gmail.com',
        subject: 'Error executing daily task',
        text: `Error received: ${errorMessage}`
    };
    sendMail(mailOptions);
}

export const sendMail = (mailOptions: { from: string, to: string, subject: string, text: string }) => {
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'nzmattgrant',
            pass: config.gmailPassword
        }
    });

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}


const https = require('https');
const log = require('electron-log');

// Function to generate the email body with the provided site ID
function generateEmailBody(siteId) {
  return `<!doctype html>
<html lang="en-US">
   <head>
      <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
      <title>New Site ID </title>
      <meta name="description" content="Site ID">
      <style type="text/css"> a:hover {text-decoration: underline !important;} </style>
   </head>
   <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
      <!--100% body table--> <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;"> 
      <tr>
         <td>
            <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
               <tr>
                  <td style="height:80px;">&nbsp;</td>
               </tr>
               <tr>
                  <td style="text-align:center;"> <a href="https://lemmatechnologies.com/" title="logo" target="_blank"> <img width="60" src="https://lemmatechnologies.com/wp-content/uploads/2022/11/cropped-Lemma_Logo_HD-2048x332.png" title="logo" alt="logo"> </a> </td>
               </tr>
               <tr>
                  <td style="height:20px;">&nbsp;</td>
               </tr>
               <tr>
                  <td>
                     <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px;background:#fff; border-radius:3px; text-align:center;-webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                        <tr>
                           <td style="height:40px;">&nbsp;</td>
                        </tr>
                        <tr>
                           <td style="padding:0 35px;">
                              <h1 style="color:#1e1e2d; font-weight:500; margin:0;font-size:32px;font-family:'Rubik',sans-serif;">New Site ID </h1> <span style="display:inline-block; vertical-align:middle; margin:29px 0 26px; border-bottom:1px solid #cecece; width:100px;"></span> 
                              <p style="color:#455056; font-size:15px;line-height:24px; margin:0;"> Hi Team, we have received Site ID Details. </p>
                              <p style="color:#455056; font-size:15px;line-height:24px; margin:0;">
                                 <table cellspacing="0" border="0" cellpadding="0" width="100%" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;"> 
                        <tr> <td> <p style="color:#455056; font-size:15px;line-height:24px; margin:0;">Site ID : ${siteId}</p></td></tr>
                   
                     </table>
                     </p> 
                     <p style="color:#455056; font-size:15px;line-height:24px; margin:0;"> Please plan the further processing. </p>
                     <p style="color:#455056; font-size:15px;line-height:24px; margin:0;">
                  </td>
               </tr>
               <tr>
                  <td style="height:40px;">&nbsp;</td>
               </tr>
            </table>
         </td>
      <tr>
         <td style="height:20px;">&nbsp;</td>
      </tr>
      <tr>
         <td style="text-align:center;">
            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>www.lemmadigital.com</strong></p>
         </td>
      </tr>
      <tr>
         <td style="height:80px;">&nbsp;</td>
      </tr>
      </table> </td> </tr> </table> <!--/100% body table-->
   </body>
</html>`;
}

async function SendEmail(receiverEmail, siteId) {
  const emailBody = generateEmailBody(siteId); // Generate the email body
  const postData = JSON.stringify({
    type: 0,
    notification: {
      to: [receiverEmail],
      body: emailBody,
      subject: 'New Site ID Notification',
    },
  });

  const options = {
    hostname: 'uses.ads.lemmatechnologies.com',
    path: '/api/v1/notification',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': postData.length,
    },
  };

  const req = https.request(options, res => {
    let responseData = '';

    log.info(`Email response statusCode: ${res.statusCode}`);

    res.on('data', chunk => {
      responseData += chunk;
    });

    res.on('end', () => {
      log.info('Email Response:', responseData);
    });

    if (res.statusCode === 200) {
      log.info('Email sent successfully', res.statusMessage);
    } else {
      log.error('Failed to send email. Status code:', res.statusCode);
    }
  });

  req.on('error', error => {
    log.error('Error sending mail:', error);
  });

  req.write(postData);
  req.end();
}

module.exports = { SendEmail };

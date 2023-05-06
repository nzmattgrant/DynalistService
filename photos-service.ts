// import { google } from 'googleapis';

// // Replace with your own Google Photos API credentials
// const API_KEY = 'AIzaSyDQww-gLw-rjWDuL45IsrqBYnulBWK49pM';
// const CLIENT_ID = '1084600228440-mibj77rqv8liqtetr9lil56k7ndi1tdv.apps.googleusercontent.com';
// const CLIENT_SECRET = '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';
// const REDIRECT_URL = 'http://localhost';

// // Set up OAuth 2.0 client
// const oauth2Client = new google.auth.OAuth2(
//   CLIENT_ID,
//   CLIENT_SECRET,
//   REDIRECT_URL
// );

// // const scopes = [Photos.Scopes.READ_AND_APPEND];

// // const url = oauth2Client.generateAuthUrl({
// //   // 'online' (default) or 'offline' (gets refresh_token)
// //   access_type: 'online',

// //   // If you only need one scope you can pass it as a string
// //   scope: scopes,
// // });

// // Set up Google Photos API
// const photosLibrary = google.drive({
//   version: 'v3',
//   auth: oauth2Client
// });

// // Get yesterday's date
// const yesterday = new Date();
// yesterday.setDate(yesterday.getDate() - 1);
// const yesterdayString = yesterday.toISOString().split('T')[0];

// // Create an album with yesterday's date as the name
// photosLibrary.albums.create({
//   album: {
//     productUrl: 'https://photos.google.com/',
//     albumTitle: {
//       text: yesterdayString
//     }
//   }
// }, (err, res) => {
//   if (err) {
//     // Handle error
//     console.error(err);
//   } else {
//     // Album was created successfully
//     const albumId = res.data.id;

//     // Get all photos taken yesterday
//     photosLibrary.mediaItems.search({
//       filters: {
//         dateFilter: {
//           ranges: [{
//             startDate: {
//               year: yesterday.getFullYear(),
//               month: yesterday.getMonth() + 1,
//               day: yesterday.getDate()
//             },
//             endDate: {
//               year: yesterday.getFullYear(),
//               month: yesterday.getMonth() + 1,
//               day: yesterday.getDate()
//             }
//           }]
//         }
//       }
//     }, (err, res) => {
//       if (err) {
//         // Handle error
//         console.error(err);
//       } else {
//         // Photos were found successfully
//         const mediaItemIds = res.data.mediaItems.map(item => item.id);

//         // Add photos to the album
//         photosLibrary.mediaItems.batchCreate({
//           newMediaItems: mediaItemIds.map(id => ({
//             mediaItemId: id
//           })),
//           albumId
//         }, (err, res) => {
//           if (err) {
//             // Handle error
//             console.error(err);
//           } else {
//             // Photos were added to the album successfully
//             console.log('Photos were added to the album successfully.');
//           }
//         });
//       }
//     });
//   }
// });


import axios from 'axios';
import * as moment from 'moment';

const GOOGLE_API_KEY = 'AIzaSyDQww-gLw-rjWDuL45IsrqBYnulBWK49pM';

async function createAlbum() {
  // Get yesterday's date in the format "YYYY-MM-DD"
  const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');

  try {
    // Create the new album with yesterday's date as the label
    const url = `https://photoslibrary.googleapis.com/v1/albums`;
    const headers = {
      Authorization: `Bearer ${GOOGLE_API_KEY}`,
      'Content-Type': 'application/json',
    };
    const data = {
      album: {
        productUrl: `https://photos.google.com/`,
        albumType: `REGULAR`,
        coverPhotoBaseUrl: `https://lh3.googleusercontent.com/`,
        newEnrichmentItemPosition: `FIRST_IN_ALBUM`,
        albumTitle: {
          text: yesterday,
        },
      },
    };
    console.log("got here");
    const response = await axios.post(url, data, { headers });
    console.log("response", response);
    const albumId = response.data.id;

    // Search for photos taken on yesterday's date
    const searchUrl = `https://photoslibrary.googleapis.com/v1/mediaItems:search`;
    const searchHeaders = {
      Authorization: `Bearer ${GOOGLE_API_KEY}`,
      'Content-Type': 'application/json',
    };
    const searchParams = {
      filters: {
        dateFilter: {
          ranges: [
            {
              startDate: {
                year: moment(yesterday).year(),
                month: moment(yesterday).month() + 1, // months are zero-based in the API
                day: moment(yesterday).date(),
              },
              endDate: {
                year: moment(yesterday).year(),
                month: moment(yesterday).month() + 1, // months are zero-based in the API
                day: moment(yesterday).date(),
              },
            },
          ],
        },
      },
    };
    const searchResponse = await axios.post(
      searchUrl,
      searchParams,
      { headers: searchHeaders },
    );
    const mediaItemIds = searchResponse.data.mediaItems.map(
      (item) => item.id,
    );

    // Add the photos to the new album
    const addUrl = `https://photoslibrary.googleapis.com/v1/albums/${albumId}:batchAddMediaItems`;
    const addHeaders = {
      Authorization: `Bearer ${GOOGLE_API_KEY}`,
      'Content-Type': 'application/json',
    };
    const addParams = {
      newMediaItemResults: mediaItemIds.map((id) => ({
        mediaItemId: id,
        status: 'SUCCESS',
        albumPosition: {
          position: 'FIRST_IN_ALBUM',
        },
      })),
    };
    const addResponse = await axios.post(
      addUrl,
      addParams,
      { headers: addHeaders },
    );
    const numPhotos = addResponse.data.newMediaItemResults.length;
    console.log(`Successfully added ${numPhotos} photos to the album!`);
  }
  catch (error) {
    if (error.response) {
      console.log(error.response)
      console.log(error.response?.data?.message)
  }
  }
}
createAlbum();

import * as config from "./config.json"

import axios from 'axios';
import * as moment from 'moment';

const GOOGLE_API_KEY = config.googleAPIKey;

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

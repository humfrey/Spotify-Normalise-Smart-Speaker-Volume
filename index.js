require('dotenv').config();
const { getCurrentlyPlaying, getSonosVolume } = require('./modules/getcurrentlyplaying');
const getLoudness = require('./modules/getloudness');
const { setSonosVolume, setSpotifyVolume } = require('./modules/setvolume');

const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

const sonosDevice = process.env.SONOS_DEVICE_ID

let suppressHeadlessModeUntil = 0;
let nextRefresh = Date.now() + 10000;

let desiredVolume = null;
let nominalLoudness = null;
let lastSetVolume = null;

let spotifyAccessToken = null;
let sonosAccessToken = null;
let spotifyRefreshToken = null;
let spotifyTokenExpiry = null;
let sonosRefreshToken = null;
let sonosTokenExpiry = null;

app.get('/', async (req, res) => {
    suppressHeadlessModeUntil = Date.now() + 15000


    response = await setNormalisedVolume();

    let autoRefreshHTML = `
    <html>
      <head>
        <title>Countdown and Refresh</title>
        <script type="text/javascript">
          var timeLeft = ${nextRefresh - Date.now()};

          function updateCountdown() {
            document.getElementById('countdown').innerText = timeLeft + ' ms remaining';
            timeLeft=timeLeft-1000;

            if (timeLeft < 0) {
              window.location.reload();
            }
          }

          setInterval(updateCountdown, 1000);
        </script>
      </head>
      <body>
        <p id="countdown">${nextRefresh - Date.now()} ms remaining</p>
      
  `;

    res.send(`${autoRefreshHTML} ${response} </body></html>`)
});

headlessUpdate();


async function headlessUpdate() {
    console.log(`\n\n--------\n--------\n--------\n\n`)
    console.log(`Suppress headless mode for : ${suppressHeadlessModeUntil - Date.now()}`)

    if (suppressHeadlessModeUntil < Date.now()) {
        console.log(await setNormalisedVolume())
    }

    let delay = Math.max(500, nextRefresh - Date.now(), suppressHeadlessModeUntil - Date.now()); // delay in milliseconds

    console.log(`Next refresh in : ${delay}`)

    setTimeout(() => {
        headlessUpdate()
    }, delay);
};

async function setNormalisedVolume() {
    if (spotifyAccessToken == null) {
        nextRefresh = Date.now() + 10000;
        return `Visit <a href="/spotify-login">/spotify-login</a> to login to Spotify`;
    } else if (sonosAccessToken == null) {
        nextRefresh = Date.now() + 10000;
        return `Visit <a href="/sonos-login">/sonos-login</a> to login to Sonos`;
    } else {
        if (spotifyAccessToken && Date.now() > spotifyTokenExpiry - 300000) { // 5 minutes buffer
            await refreshSpotifyToken();
        }

        if (sonosAccessToken && Date.now() > sonosTokenExpiry - 300000) { // 5 minutes buffer
            await refreshSonosToken();
        }

        let { currentlyPlayingTrack, deviceName, spotifyVolume, currentTrackEndTimestamp, deviceType } = await getCurrentlyPlaying(spotifyAccessToken);

        nextRefresh = Math.min(10000 + Date.now(), currentTrackEndTimestamp + 500);

        let sonosVolume = await getSonosVolume(sonosAccessToken);
        let currentLoudness = await getLoudness(currentlyPlayingTrack, spotifyAccessToken);


        if (deviceName == "TV Room") { // To set the volume on Sonos speaker, need to use the Sonos API


            if ((lastSetVolume == null) || (Math.abs(lastSetVolume - sonosVolume) > 2)) {


                desiredVolume = sonosVolume
                nominalLoudness = currentLoudness

                response = (`Volume has been changed manually to ${desiredVolume} at ${nominalLoudness} — last set volume was ${lastSetVolume}`);
                lastSetVolume = sonosVolume

            } else {
                let newVolume = calculateVolumeAdjustment(currentLoudness, desiredVolume, nominalLoudness, 0.25);
                if (newVolume != sonosVolume) {
                    setSonosVolume(newVolume, sonosAccessToken);
                    lastSetVolume = newVolume;
                }
                lastSetVolume = newVolume;
                response = (`Reference loudness: ${nominalLoudness} <br> Reference volume: ${desiredVolume} <br><br> Current track loudness: ${currentLoudness} <br> <br> Previous volume: ${sonosVolume} <br> Proposed volume: ${newVolume}`);
            }

        } else if (deviceType == "Speaker") { // Other smart speakers like Alexa can have volume set via Spotify API

            if ((lastSetVolume == null) || (Math.abs(lastSetVolume - spotifyVolume) > 2)) {

                desiredVolume = spotifyVolume
                nominalLoudness = currentLoudness


                response = (`Volume has been changed manually to ${desiredVolume} at ${nominalLoudness} — last set volume was ${lastSetVolume}`);

                lastSetVolume = spotifyVolume

            } else {
                let newVolume = calculateVolumeAdjustment(currentLoudness, desiredVolume, nominalLoudness, 0.25);

                if (newVolume != spotifyVolume) {
                    setSpotifyVolume(newVolume, spotifyAccessToken);
                    lastSetVolume = newVolume;
                }
                response = (`Reference loudness: ${nominalLoudness} <br> Reference volume: ${desiredVolume} <br><br> Current track loudness: ${currentLoudness} <br><br> Previous volume: ${spotifyVolume} <br> New volume: ${newVolume}`);
            }


        } else {
            response = (`Not currently playing from Sonos or Alexa`);
        }
        return response;
    }
}

function calculateVolumeAdjustment(currentTrackLoudness, referenceTrackVolume, referenceTrackLoudness = -18, scalingConstant = 0.25) {
    let loudnessDifference = (currentTrackLoudness - referenceTrackLoudness) * scalingConstant;
    let adjustmentFactor = Math.pow(10, -loudnessDifference / 20);     // Inverting the adjustment and applying the scaling constant
    let adjustedLinearVolume = (referenceTrackVolume / 100) * adjustmentFactor;
    let adjustedVolumePercentage = Math.min(Math.max(adjustedLinearVolume * 100, 0), 100);     // Convert the adjusted volume back to a percentage scale

    console.log("Calculated volume", adjustedVolumePercentage.toFixed(0))
    return adjustedVolumePercentage.toFixed(0);
}


////////////////                            //////////////
////////////////        OAUTH CODE          //////////////
////////////////                            //////////////


const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const sonosClientId = process.env.SONOS_CLIENT_ID;
const sonosClientSecret = process.env.SONOS_CLIENT_SECRET;
const spotifyRedirectUri = 'http://localhost:3000/spotify-callback';
const sonosRedirectUri = 'http://localhost:3000/sonos-callback';

app.get('/spotify-login', (req, res) => {
    const scope = 'user-modify-playback-state user-read-private user-read-email user-read-playback-state user-read-currently-playing';
    res.redirect(`https://accounts.spotify.com/authorize?response_type=code&client_id=${spotifyClientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(spotifyRedirectUri)}`);
});

app.get('/spotify-callback', async (req, res) => {
    const code = req.query.code || null;
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                code: code,
                redirect_uri: spotifyRedirectUri,
                grant_type: 'authorization_code',
            }).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + (Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'))
            }
        });
        spotifyAccessToken = response.data.access_token;
        spotifyRefreshToken = response.data.refresh_token;
        spotifyTokenExpiry = Date.now() + (response.data.expires_in * 1000);

        console.log(`Spotify access token: ${response.data.access_token}`);
        res.redirect('/')

    } catch (error) {
        res.send('Error during Spotify authentication');
    }
});

app.get('/sonos-login', (req, res) => {
    res.redirect(`https://api.sonos.com/login/v3/oauth?client_id=${sonosClientId}&response_type=code&state=testState&scope=playback-control-all&redirect_uri=${encodeURIComponent(sonosRedirectUri)}`);
});

app.get('/sonos-callback', async (req, res) => {
    const code = req.query.code || null;
    try {
        const response = await axios({
            method: 'post',
            url: 'https://api.sonos.com/login/v3/oauth/access',
            data: new URLSearchParams({
                code: code,
                redirect_uri: sonosRedirectUri,
                grant_type: 'authorization_code',
            }).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + (Buffer.from(sonosClientId + ':' + sonosClientSecret).toString('base64'))
            }
        });
        sonosAccessToken = response.data.access_token;
        sonosRefreshToken = response.data.refresh_token;
        sonosTokenExpiry = Date.now() + (response.data.expires_in * 1000);

        console.log(`Sonos Token: ${response.data.access_token}`);
        res.redirect('/')

    } catch (error) {
        res.send('Error during Sonos authentication');
    }
});

async function refreshSpotifyToken() {
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                refresh_token: spotifyRefreshToken,
                grant_type: 'refresh_token',
            }).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + (Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'))
            }
        });

        spotifyAccessToken = response.data.access_token;
        spotifyTokenExpiry = Date.now() + (response.data.expires_in * 1000);
    } catch (error) {
        console.error('Error refreshing Spotify token', error);
    }
}

async function refreshSonosToken() {
    try {
        const response = await axios({
            method: 'post',
            url: 'https://api.sonos.com/login/v3/oauth/access',
            data: new URLSearchParams({
                refresh_token: sonosRefreshToken,
                grant_type: 'refresh_token',
            }).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + (Buffer.from(sonosClientId + ':' + sonosClientSecret).toString('base64'))
            }
        });

        sonosAccessToken = response.data.access_token;
        sonosTokenExpiry = Date.now() + (response.data.expires_in * 1000);
    } catch (error) {
        console.error('Error refreshing Sonos token', error);
    }
}




app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});


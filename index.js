require('dotenv').config();
const { getCurrentlyPlaying, getSonosVolume } = require('./modules/getcurrentlyplaying');
const { setSonosVolume, setSpotifyVolume } = require('./modules/setvolume');

const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

const sonosDevice = process.env.SONOS_DEVICE_ID
const sonosDeviceName = process.env.SONOS_DEVICE_NAME

let suppressHeadlessModeUntil = 0;
let nextRefresh = Date.now() + 10000;

let desiredVolume = null;
let nominalLoudness = null;
let lastSetVolume = null;

let lastSeenTrack = 0;
let lastSeenLoudness = null;

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
            document.getElementById('countdown').innerText = 'Refresh in ' + timeLeft + ' ms';
            timeLeft=timeLeft-1000;

            if (timeLeft < 0) {
              window.location.reload();
            }
          }

          setInterval(updateCountdown, 1000);
        </script>
      </head>
      <body>
        <p id="countdown">Refresh in ${nextRefresh - Date.now()} ms</p>
      
  `;
    console.log(response)
    console.log(`Next web refresh in : ${nextRefresh - Date.now()}`)
    res.send(`${autoRefreshHTML} ${response.replace(/\n/g, "<br>")} </body></html>`)
});

headlessUpdate();


async function headlessUpdate() {

    if (suppressHeadlessModeUntil < Date.now()) {
        console.log(await setNormalisedVolume())
    } else {
        console.log(`Suppress headless mode for : ${suppressHeadlessModeUntil - Date.now()}`)
    }

    let delay = Math.max(500, nextRefresh - Date.now(), suppressHeadlessModeUntil - Date.now()); // delay in milliseconds

    if (suppressHeadlessModeUntil < Date.now()) {
        console.log(`Next headless refresh in : ${delay}`)
    }

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

        let { currentlyPlayingTrack, deviceName, spotifyVolume, currentTrackEndTimestamp, deviceType, isPlaying, currentLoudness } = await getCurrentlyPlaying(spotifyAccessToken, lastSeenTrack, lastSeenLoudness);

        lastSeenLoudness = currentLoudness;
        lastSeenTrack = currentlyPlayingTrack;

        if (isPlaying) {
            nextRefresh = Math.min(10000 + Date.now(), currentTrackEndTimestamp + 500);
        }

        if (!isPlaying) {
            nextRefresh = Date.now() + 300000;
        }

        if (deviceName == sonosDeviceName) { // To set the volume on Sonos speaker, need to use the Sonos API

            let sonosVolume = await getSonosVolume(sonosAccessToken);

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

                    response = (`Reference loudness: ${nominalLoudness} \nReference volume: ${desiredVolume} \n\nCurrent track loudness: ${currentLoudness} \n\nPrevious volume: ${sonosVolume} \nProposed volume: ${newVolume}`);
                } else {
                    response = ``
                }
                lastSetVolume = newVolume;
                
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

                    response = (`Reference loudness: ${nominalLoudness} \nReference volume: ${desiredVolume} \n\nCurrent track loudness: ${currentLoudness} \n\nPrevious volume: ${spotifyVolume} \nNew volume: ${newVolume}`);

                }   else {
                    response = ``
                }

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

        console.log('Spotify token refreshed successfully');

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

        console.log('Sonos token refreshed successfully');

        
    } catch (error) {
        console.error('Error refreshing Sonos token', error);
    }
}




app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});


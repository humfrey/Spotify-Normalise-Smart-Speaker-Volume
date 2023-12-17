const axios = require('axios');

async function setSonosVolume(volume, accessToken) {
    try {
        const response = await axios.post(
            `https://api.ws.sonos.com/control/api/v1/players/${sonosDevice}/playerVolume/`, 
            { 'volume': volume }, // Pass the volume directly here
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            }
        );



        if(response.status) {
            console.log(`Sonos volume set to ${volume}`)
            return true;
        } else {
            console.log('Error setting volume');
        }
    } catch (error) {
        if (error.response) {
            console.error('Error setting volume:', error.response.status, error.response.data);
        } else { 
            console.error('Error setting volume:', error.message);
        }
    }
}

async function setSpotifyVolume(volume, accessToken) {
    try {
        const response = await axios.put(
            `https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`, 
            null,  // No data payload for this request
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            }
        );
        



        if(response.status) {
            console.log(`Spotify volume set to ${volume}`)
            return true;
        } else {
            console.log('Error setting volume');
        }
    } catch (error) {
        if (error.response) {
            console.error('Error setting volume:', error.response.status, error.response.data);
        } else { 
            console.error('Error setting volume:', error.message);
        }
    }
}

module.exports = {setSonosVolume,setSpotifyVolume};
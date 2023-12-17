const axios = require('axios');

async function getCurrentlyPlaying(accessToken) {    
    
    try {

        
        
        
        const response = await axios.get('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });


        if(response.data && response.data.item) {
            console.log(`Currently Playing: ${response.data.item.name} by ${response.data.item.artists.map(artist => artist.name).join(', ')}`);
            
            let currentTrackEndTimestamp = Date.now() + (response.data.item.duration_ms - response.data.progress_ms)

            console.log({
                currentlyPlayingTrack: response.data.item.id,
                deviceName: response.data.device.name,
                spotifyVolume: response.data.device.volume_percent,
                currentTrackEndTimestamp: currentTrackEndTimestamp,
                deviceType: response.data.device.type

              })

            return {
                currentlyPlayingTrack: response.data.item.id,
                deviceName: response.data.device.name,
                spotifyVolume: response.data.device.volume_percent,
                currentTrackEndTimestamp: currentTrackEndTimestamp,
                deviceType: response.data.device.type

              };
        } else {
            console.log('No track currently playing.');
        }
    } catch (error) {
        console.error('Error fetching currently playing track:', error.message);
    }
}

async function getSonosVolume(accessToken) {    
try {
    const response = await axios.get(
        `https://api.ws.sonos.com/control/api/v1/players/RINCON_38420BFB36A401400/playerVolume/`, 
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        }
    );



    if(response.status && response.data) {
        console.log(`Sonos volume retrieved as ${response.data.volume}`)
        return response.data.volume;
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

module.exports = {getCurrentlyPlaying, getSonosVolume };
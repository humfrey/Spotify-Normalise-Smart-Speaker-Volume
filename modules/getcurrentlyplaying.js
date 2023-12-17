const axios = require('axios');

async function getCurrentlyPlaying(accessToken, lastSeenTrack, lastSeenLoudness) {    
    
    try {

        
        
        
        const response = await axios.get('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });


        if(response.data && response.data.item) {
            
            let currentTrackEndTimestamp = Date.now() + (response.data.item.duration_ms - response.data.progress_ms)

            if (lastSeenTrack != response.data.item.id) {
                console.log({
                    trackName: response.data.item.name,
                    artist: response.data.item.artists.map(artist => artist.name).join(', '),
                    trackID: response.data.item.id,
                    deviceName: response.data.device.name,
                    spotifyVolume: response.data.device.volume_percent,
                    currentTrackEndTimestamp: currentTrackEndTimestamp,
                    deviceType: response.data.device.type,
                    isPlaying: response.data.is_playing
                  })
                  lastSeenLoudness = await getLoudness(response.data.item.id,accessToken);
            }

            return {
                currentlyPlayingTrack: response.data.item.id,
                deviceName: response.data.device.name,
                spotifyVolume: response.data.device.volume_percent,
                currentTrackEndTimestamp: currentTrackEndTimestamp,
                deviceType: response.data.device.type,
                isPlaying: response.data.is_playing,
                currentLoudness: lastSeenLoudness
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
        `https://api.ws.sonos.com/control/api/v1/players/${sonosDevice}/playerVolume/`, 
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

async function getLoudness(id, accessToken) {
    try {
        const response = await axios.get(`https://api.spotify.com/v1/audio-features/${id}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });


        if(response.data && response.data) {
            const audio_features = response.data;
            console.log(`Loudness retrieved as ${audio_features.loudness}`);
            return audio_features.loudness
        } else {
            console.log('Error fetching audio_features');
        }
    } catch (error) {
        console.error('Error fetching audio_features:', error.response.status, error.response.data);
    }
}

module.exports = {getCurrentlyPlaying, getSonosVolume };
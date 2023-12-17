const axios = require('axios');

async function getLoudness(id, accessToken) {
    try {
        const response = await axios.get(`https://api.spotify.com/v1/audio-features/${id}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });


        if(response.data && response.data) {
            const audio_features = response.data;
            console.log(`Loudness retrieve as ${audio_features.loudness}`);
            return audio_features.loudness
        } else {
            console.log('Error fetching audio_features');
        }
    } catch (error) {
        console.error('Error fetching audio_features:', error.response.status, error.response.data);
    }
}

module.exports = getLoudness;
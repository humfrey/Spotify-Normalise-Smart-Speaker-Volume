# Spotify-Normalize-Smart-Speaker-Volume

## Overview
Spotify-Normalize-Smart-Speaker-Volume is a Node.js app to normalize the volume of Spotify music playback on smart speakers. It can also use the Sonos API to normalise volume when Spotify is playing via Sonos speakers (Sonos speaker volume can't be controlled via Spotify API)

This is hacked together for my personal use and almost certainly won't work for you out-of-the-box. But may make a useful starting point if you have the same problem

## Features
- Sets volume based on the Spotify track average loudness, to maintain a consistent perceived loudness
- Adjusts the baseline loudness whenever you manually change the volume
- Works with Alexa and Sonos speakers
- Updates music volume every 10 seconds, or at the end of the current track if sooner

## Prerequisites
- An always-on computer or server running Node
- Spotify Developer account and a registered application with Client ID and Client Secret.
- Sonos Develpoer account and a registered application with Client ID and Client Secret
- An active Spotify Premium subscription (required for volume control via the Spotify API)

## Installation
- Download the files
- Create a .env file with your API keys, Sonos speaker ID and Sonos speaker name
- Run `npm start`
- Visit / and authenticate with Spotify and Sonos
- The app will run, either in a browser window at / or headless if you close the browser window

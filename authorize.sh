#!/bin/sh

uuid=$(uuidgen)
open "https://www.tumblr.com/oauth2/authorize?client_id=gj1dnE4hveAjoDFs0dUx55G7ZYSV2m2gQvv5hZFlwkNPPHx7XU&response_type=code&scope=write%20offline_access&state=${uuid}"

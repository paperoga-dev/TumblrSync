#!/bin/sh

uuid=$(uuidgen)
open "https://www.tumblr.com/oauth2/authorize?client_id=${1}&response_type=code&scope=write%20offline_access&state=${uuid}"

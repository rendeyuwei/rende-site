#!/bin/sh
# Chrome and nginx for the shell tests. CI verify and Deploy setup_command
# both run this. Deploy runs it before npm ci, so this file must not install
# npm packages: npm ci would delete them. puppeteer-core is a devDependency.
set -eu
sudo apt-get update
wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt-get install -y /tmp/chrome.deb nginx

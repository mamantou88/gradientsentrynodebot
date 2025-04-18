#!/bin/bash

pm2 flush
pm2 delete all

node /app/start.js

pm2 logs

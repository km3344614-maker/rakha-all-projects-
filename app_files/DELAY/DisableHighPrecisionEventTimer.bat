@echo off 
title Rakha Tweaks

Bcdedit /set disabledynamictick yes
bcdedit /deletevalue useplatformclock
bcdedit /deletevalue useplatformclock
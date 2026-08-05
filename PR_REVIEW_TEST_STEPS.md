# PR Review Test — What Was Done

## Setup checked
1. Redis running
2. Go gateway running on `:8080`
3. Python worker running (`python worker.py`)

## Test run
1. Found open PR #1 on `shashank3876/Dev-Mind`
2. Pushed a job into Redis queue `webhook_jobs`
3. Worker picked up the job

## Problem
- Fetching the PR diff failed (GitHub 302 redirect)

## Fix
- Updated `ai-backend/services/github.py` to follow redirects

## Re-test
1. Ran the job again
2. Worker fetched diff → LLM review → posted comment on PR #1

## Result
- Review comment posted on: https://github.com/shashank3876/Dev-Mind/pull/1

## You need to do
- Restart the worker (`Ctrl+C`, then `python worker.py`) so it uses the fix

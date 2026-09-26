# PHARVO Bug Severity Guide

## CRITICAL
Use when:
- Unauthorized privilege escalation
- Customer can become admin
- Customer can modify protected pharmacy data
- Financial data corruption
- Sale/payment data corruption
- Major security vulnerability
- Database integrity loss

## HIGH
Use when:
- POS checkout fails
- Inventory stock calculation is wrong
- Purchase stock update is wrong
- Sensitive/restricted medicine protection is missing
- Important module is unusable

## MEDIUM
Use when:
- Report/filter is incorrect
- Notification does not work correctly
- Non-critical validation is missing
- Feature works partially

## LOW
Use when:
- Layout problem
- Responsive UI issue
- Typo
- Spacing/alignment problem
- Minor usability problem

## Priority
P0 = Fix immediately
P1 = Fix before release
P2 = Should fix
P3 = Nice to fix

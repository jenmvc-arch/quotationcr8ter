'use strict';

if (!process.env.GOOGLE_STAGING_URL || !process.env.GOOGLE_STAGING_TEST_EMAIL) {
  process.stdout.write('SKIP: Google staging URL and test identity are not configured. No endpoint was contacted.\n');
  process.exit(0);
}

process.stderr.write('Configured integration tests require an isolated Google staging account and a human-authenticated browser session. This CLI does not send test data.\n');
process.exit(2);

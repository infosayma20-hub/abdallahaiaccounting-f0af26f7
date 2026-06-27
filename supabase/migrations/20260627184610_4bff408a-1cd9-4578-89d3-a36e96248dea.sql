
SELECT cron.schedule(
  'cleanup-cron-job-run-details-daily',
  '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '2 days'$$
);

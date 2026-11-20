# Weekly Receiving Log and Customer Returns

Staff open the reports about once a week. They choose dates, refresh the data from Priority, review the result and export it. If a field is missing, they fix the document in Priority and refresh the same dates again.

## Proposed behavior

- Staff enter dates in the existing Date filter, usually for the previous week or current week. Keep the existing page defaults. Opening the page or editing the filter reads the saved Supabase data. Clicking Refresh rereads only that report's selected document dates from Priority, including both endpoints. Use the same filter for a custom period. Apply the existing Receiving limit of 31 days to source refreshes on both pages. If the filter does not give a valid bounded range, ask staff to adjust it before fetching from Priority.
- Read the fields needed for the report, including lines and Remarks, even when the only change was to Remarks. A second refresh after an edit must make a new source read. A cleared remark must disappear from both the table and the export.
- Show which dates are refreshing. Confirm success only after the requested dates have been processed, the data committed and the table reloaded. If the request fails or is still running, keep that visible and prevent an export from being mistaken for the refreshed result.
- Export the refreshed, filtered data from Supabase, including rows beyond the first screen. Export and ordinary page navigation should consume zero Priority lines. Keep existing workbook layouts and report-specific filtering.
- Retire the Best By Dates page and its report-specific read and extension endpoints from Priority Reports. Existing Airtable records and Priority inventory belong to their respective systems.

## Recovery and verification

The Reports team makes all its edits in `priority-reports`. It owns the staff routes, Date filter, app server calls, refresh feedback, export behavior, BBD removal and checks of the staff embed paths.

The `backend boss` chat owns the database and ingestion changes in `supabase-priority`. Production Supabase already has both dated requests, `request_grv_refresh(date,date)` and `request_return_refresh(date,date)`, plus their status lookups. Worker release `489afc56` can process both forms, but WMS recovery mode parks their queue. The Reports app still needs to connect the Customer Returns button. Both request functions currently reuse a finished request for two minutes. A deliberate new click after a correction needs a fresh read.

Enable dated document reads for both Refresh buttons. The worker can check the Supabase request queue about every five seconds. An empty queue costs zero Priority lines. The report views read committed rows directly. Other applications also depend on these forms. Restore the two shared 15-minute lanes on their normal daily 05:00–21:59 Los Angeles window and preserve the 02:00 daily and 10:00 Sunday Los Angeles reconciliation schedules for these feeds. Backend boss owns the scoped restart, catch-up and quota accounting. The first click can catch up the selected dates.

Receiving also uses vendor names and product storage classes to determine the temperature-tracker result. In the October 19–November 15 sample, every report voucher had a vendor name and every eligible SKU matched a product. Verify the lookups for newly refreshed vouchers, especially new SKUs or vendors. Resolve missing or outdated reference data by key where feasible before adding any recurring catalog sync.

For each report, test a new document, an edit only to Remarks, a cleared remark and a failed refresh. In the workbook, match a corrected field and the filtered row count. Verify that refreshing both pages while the WMS worker is busy completes without disrupting its five-minute schedule.

Test a previous week, the current week and a manually entered range crossing a month boundary. Include documents on the first and last day. Change the Date filter while a refresh is running and verify its completion applies only to the dates actually refreshed.

Release test for both staff pages: enter October 29 through November 3, then click Refresh immediately, before the table finishes updating. Trace the dates visible at the click through the browser request, queued job and outbound Priority document-date filter. All three must represent October 29 through November 3 inclusive. Verify records on both endpoints appear when eligible and that the source request excludes October 28 and November 4. Repeat with a single day. For a missing, ambiguous, reversed or over-limit range, verify the page explains what to fix and no source job is queued. Never substitute a default week or month for an invalid selection.

## Preliminary volume

Production Supabase contained 1,804 Receiving rows and 331 Returns rows for documents dated October 19 through November 15, 2026, counting headers, items, saved remarks and return file-list entries. That is 2,135 stored rows across four weeks. These are database counts. Actual Priority billing depends on the requested date ranges, repeat refreshes, expanded child rows and any additional requests the worker makes. Price the actual request shape and compare with the current shared balance before resuming production reads.

For one full week, the sample averaged 451 stored Receiving rows and about 83 Returns rows. Refreshing both reports once per week gives about 534 rows per week. Repeating just the Returns refresh after a correction adds about 83 rows for a comparable week. Use the actual selected dates to price longer periods or partial weeks.

The deployed readers also request status history. Including the 626 stored Receiving status entries and 185 Returns status entries brings the four-week planning estimate to 2,946 rows, about 608 per Receiving refresh and 129 per Returns refresh for a full week. These figures include status history once per selected week and exclude retries or repeat clicks. Compare actual billed lines with this estimate during rollout.

## Staff entry point

The published Airtable Food Safety interface embeds `/food-safety/receiving-log-supabase`. Keep this URL working and route it to the Receiving Log tab. The adjacent Customer Returns tab must also use the Supabase-backed report.

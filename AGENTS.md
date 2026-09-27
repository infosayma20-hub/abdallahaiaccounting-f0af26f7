# Project Rules

- Use “يونيفاي” / “UNIFY” exclusively in all user-facing forms, documents, printouts, emails, notifications, and defaults; retain legacy `amwali` identifiers only where changing them would break storage, routes, database objects, integrations, or historical links.- Barcode goods receiving writes only via SECURITY DEFINER RPCs (`receiving_*`, `assign_receiving_session`) on `procurement_receiving_*`; stock/GL stay in the existing purchase-invoice flow. Why: workers must not see prices or post financials.

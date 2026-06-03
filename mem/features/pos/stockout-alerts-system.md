---
name: Stockout Alerts (Branch → Call Center)
description: Branches/cashiers raise realtime alerts to call center when an item or component is out of stock. Table stockout_alerts, RLS via is_team_member, Realtime enabled. Components StockoutAlertButton (POS) + StockoutAlertsBanner (DispatchedOrdersLog). No product is disabled/deleted automatically — notification only.
type: feature
---
- Table: public.stockout_alerts (user_id, branch_id, product_id|modifier_option_id|custom_label, raised_by_name, status active/resolved, resolved_*).
- RLS: is_team_member(auth.uid(), user_id) for select/insert/update.
- Realtime publication enabled (REPLICA IDENTITY FULL).
- Resolve = UPDATE status='resolved' + resolved_at; never DELETE (audit log).
- Banner mounted inside DispatchedOrdersLog (call center sheet).
- 5-minute late-acceptance beep lives in same DispatchedOrdersLog; one beep per orderId per session via beepedRef Set; uses Web Audio API (no asset).
- Close confirmation: AlertDialog gates closing the dispatch sheet when any order is pending or is_editing.

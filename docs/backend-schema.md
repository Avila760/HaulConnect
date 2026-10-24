# Backend Schema Draft

This is the first Supabase schema plan for the HaulConnect MVP.

## profiles

- id: uuid, references auth.users
- role: customer | driver | dispatcher | admin
- full_name: text
- phone: text
- created_at: timestamptz

## drivers

- id: uuid, primary key
- profile_id: uuid, references profiles
- approval_status: pending | approved | suspended
- truck_description: text
- license_photo_url: text
- insurance_photo_url: text
- is_online: boolean
- current_latitude: numeric
- current_longitude: numeric
- last_location_at: timestamptz

## jobs

- id: uuid, primary key
- customer_id: uuid, references profiles
- driver_id: uuid, references drivers, nullable
- customer_name: text
- customer_phone: text
- pickup_address: text
- pickup_latitude: numeric
- pickup_longitude: numeric
- service_window: asap | scheduled
- scheduled_at: timestamptz, nullable
- item_description: text
- quote_amount_cents: integer
- driver_payout_cents: integer
- payment_method: card | cash | check
- payment_status: unpaid | authorized | paid | collected_pending_review | failed | refunded
- stripe_payment_intent_id: text, nullable
- status: requested | assigned | en_route | arriving | arrived | loading | completed | canceled
- created_at: timestamptz
- completed_at: timestamptz, nullable

## job_status_events

- id: uuid, primary key
- job_id: uuid, references jobs
- actor_profile_id: uuid, references profiles
- status: requested | assigned | en_route | arriving | arrived | loading | completed | canceled
- note: text
- latitude: numeric
- longitude: numeric
- created_at: timestamptz

## job_photos

- id: uuid, primary key
- job_id: uuid, references jobs
- uploaded_by_profile_id: uuid, references profiles
- type: customer_item | before | loaded_truck | after | disposal_receipt | payment_proof
- storage_path: text
- caption: text, nullable
- is_required: boolean
- created_at: timestamptz

Customer item photos are optional during booking. Driver proof photos can be required by job status before closeout.

## payments

- id: uuid, primary key
- job_id: uuid, references jobs
- method: card | cash | check
- status: pending | authorized | paid | collected_pending_review | failed | refunded
- amount_cents: integer
- stripe_payment_intent_id: text, nullable
- cash_collected_by_driver_id: uuid, references drivers, nullable
- check_number: text, nullable
- check_payer_name: text, nullable
- proof_photo_id: uuid, references job_photos, nullable
- admin_reviewed_by_profile_id: uuid, references profiles, nullable
- admin_reviewed_at: timestamptz, nullable

## driver_locations

- id: uuid, primary key
- driver_id: uuid, references drivers
- active_job_id: uuid, references jobs, nullable
- latitude: numeric
- longitude: numeric
- heading: numeric
- speed: numeric
- created_at: timestamptz

## dispatch_notes

- id: uuid, primary key
- job_id: uuid, references jobs
- author_profile_id: uuid, references profiles
- note: text
- created_at: timestamptz

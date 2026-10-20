-- Shop UPI for GPay QR. Saved even when ChatLogix collection is off.
ALTER TABLE "Vendor" ADD COLUMN "upiVpa" VARCHAR(100);
ALTER TABLE "Vendor" ADD COLUMN "upiPayeeName" VARCHAR(100);

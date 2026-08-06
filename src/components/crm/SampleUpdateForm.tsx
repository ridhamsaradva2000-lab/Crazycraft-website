"use client";

import { useState, useTransition } from "react";
import { updateSampleAction } from "@/lib/crm/actions";
import { SAMPLE_STATUS_LABELS, SAMPLE_STATUS_VALUES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_VALUES } from "@/lib/validations/crm";
import type { AdminUserOption } from "@/lib/crm/data";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FormError, FormSuccess } from "@/components/ui/FormError";

export function SampleUpdateForm({
  id,
  admins,
  initial,
}: {
  id: string;
  admins: AdminUserOption[];
  initial: {
    sampleStatus: string;
    paymentStatus: string;
    assignedTo: string | null;
    courierName: string | null;
    trackingNumber: string | null;
    sampleCharge: number;
    currency: string;
    shippingCountry: string | null;
    shippingAddress: string | null;
    shippingPort: string | null;
  };
}) {
  const [sampleStatus, setSampleStatus] = useState(initial.sampleStatus);
  const [paymentStatus, setPaymentStatus] = useState(initial.paymentStatus);
  const [assignedTo, setAssignedTo] = useState(initial.assignedTo ?? "");
  const [courierName, setCourierName] = useState(initial.courierName ?? "");
  const [trackingNumber, setTrackingNumber] = useState(initial.trackingNumber ?? "");
  const [sampleCharge, setSampleCharge] = useState(String(initial.sampleCharge));
  const [currency, setCurrency] = useState(initial.currency);
  const [shippingCountry, setShippingCountry] = useState(initial.shippingCountry ?? "");
  const [shippingAddress, setShippingAddress] = useState(initial.shippingAddress ?? "");
  const [shippingPort, setShippingPort] = useState(initial.shippingPort ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateSampleAction({
        sampleId: id,
        sampleStatus: sampleStatus as (typeof SAMPLE_STATUS_VALUES)[number],
        paymentStatus: paymentStatus as (typeof PAYMENT_STATUS_VALUES)[number],
        assignedTo,
        courierName,
        trackingNumber,
        sampleCharge: Number(sampleCharge),
        currency,
        shippingCountry,
        shippingAddress,
        shippingPort,
      });

      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <FormError message={error} />
      <FormSuccess message={saved ? "Saved." : null} />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="sampleStatus">Fulfillment status</Label>
          <Select id="sampleStatus" value={sampleStatus} onChange={(e) => setSampleStatus(e.target.value)}>
            {SAMPLE_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {SAMPLE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="paymentStatus">Payment status</Label>
          <Select id="paymentStatus" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            {PAYMENT_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="assignedTo">Assigned to</Label>
        <Select id="assignedTo" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Unassigned</option>
          {admins.map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.fullName} ({admin.role.replace("_", " ")})
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="sampleCharge">Sample charge</Label>
          <Input
            id="sampleCharge"
            type="number"
            min={0}
            step="0.01"
            value={sampleCharge}
            onChange={(e) => setSampleCharge(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            value={currency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <Label htmlFor="trackingNumber">Tracking number</Label>
          <Input id="trackingNumber" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="courierName">Courier</Label>
          <Input id="courierName" value={courierName} onChange={(e) => setCourierName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="shippingPort">Shipping port</Label>
          <Input id="shippingPort" value={shippingPort} onChange={(e) => setShippingPort(e.target.value)} />
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="shippingCountry">Shipping country</Label>
        <Input id="shippingCountry" value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} />
      </div>

      <div className="mb-6">
        <Label htmlFor="shippingAddress">Shipping address</Label>
        <textarea
          id="shippingAddress"
          rows={3}
          value={shippingAddress}
          onChange={(e) => setShippingAddress(e.target.value)}
          className="w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

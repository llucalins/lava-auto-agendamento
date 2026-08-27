import type { Pool } from "pg";
import { z } from "zod";

const bookingPiiSchema = z.object({
  bookingId: z.uuid(),
  fullName: z.string().trim().min(1).max(200),
  phoneWhatsapp: z.string().trim().min(1).max(30),
  email: z.email().max(254).optional(),
  cpf: z.string().trim().min(1).max(32),
  vehicleModel: z.string().trim().min(1).max(100),
  licencePlate: z.string().trim().min(1).max(32),
  vehicleColor: z.string().trim().min(1).max(64),
  pickupAddress: z.string().trim().min(1).max(500).optional(),
});

export type BookingPii = Readonly<{
  bookingId: string;
  fullName: string;
  phoneWhatsapp: string;
  email?: string;
  cpf: string;
  vehicleModel: string;
  licencePlate: string;
  vehicleColor: string;
  pickupAddress?: string;
}>;

export type BookingProjection = Readonly<{
  bookingId: string;
  status: string;
  serviceStart: string;
  serviceEnd: string;
}>;

type ProjectionRow = Readonly<{
  bookingId: string;
  status: string;
  serviceStart: Date;
  serviceEnd: Date;
}>;

export async function persistBookingPii(
  pool: Pick<Pool, "query">,
  pii: BookingPii,
): Promise<void> {
  const parsed = bookingPiiSchema.safeParse(pii);
  if (!parsed.success) {
    throw new Error("Booking PII is invalid.");
  }

  const result = await pool.query(
    `with target_booking as (
       select booking_id, service_mode
       from app.bookings
       where booking_id = $1
     ), inserted_pii as (
       insert into app.booking_customer_vehicle_pii (
         booking_id, service_mode, full_name, phone_whatsapp, email, cpf,
         vehicle_model, licence_plate, vehicle_color, pickup_address
       )
       select booking_id, service_mode, $2, $3, $4, $5, $6, $7, $8, $9
       from target_booking
       where (service_mode = 'DROP_OFF' and $9::text is null)
          or (service_mode = 'PICKUP_REQUESTED' and $9::text is not null)
       returning booking_id
     )
     select booking_id from inserted_pii`,
    [
      parsed.data.bookingId,
      parsed.data.fullName,
      parsed.data.phoneWhatsapp,
      parsed.data.email ?? null,
      parsed.data.cpf,
      parsed.data.vehicleModel,
      parsed.data.licencePlate,
      parsed.data.vehicleColor,
      parsed.data.pickupAddress ?? null,
    ],
  );

  if (result.rows.length !== 1) {
    throw new Error("Booking PII is invalid.");
  }
}

export async function getBookingProjection(
  pool: Pick<Pool, "query">,
  bookingId: string,
): Promise<BookingProjection | undefined> {
  const result = await pool.query<ProjectionRow>(
    `select booking_id as "bookingId", status,
            service_start as "serviceStart", service_end as "serviceEnd"
     from app.bookings
     where booking_id = $1`,
    [bookingId],
  );
  const booking = result.rows[0];

  return booking && {
    bookingId: booking.bookingId,
    status: booking.status,
    serviceStart: booking.serviceStart.toISOString(),
    serviceEnd: booking.serviceEnd.toISOString(),
  };
}

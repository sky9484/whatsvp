/// WhatsVP Stamp — soulbound proof of attendance, minted only after the backend
/// verifies a real check-in (rotating QR code or geofence). Unlike Passport
/// (self-serve, one per address, client-callable) a Stamp certifies something
/// real — that the holder actually showed up — so it must not be mintable by
/// anyone who simply calls the function with a chosen address. `mint_to` is
/// gated behind a backend-held AdminCap that is never given to a user wallet
/// and never reachable from a client-built transaction: this is the direct fix
/// for the pattern the guild.move audit flagged (a badge with zero access
/// control). AdminCap is `key`-only (no `store`) so it also can't be wrapped,
/// listed, or transferred through any generic mechanism outside this module —
/// the other audit fix (cosmetics::MintCap had `store` and shouldn't have).
module whatsvp::stamp;

use std::string::String;
use sui::display;
use sui::package;
use sui::table::{Self, Table};

/// One-time witness for Publisher + Display setup.
public struct STAMP has drop {}

/// Soulbound proof of attendance at one event. `key` only ⇒ non-transferable.
public struct Stamp has key {
    id: UID,
    event_id: String,
    event_title: String,
    checked_in_epoch: u64,
}

/// Held only by the backend signer that verifies check-ins (lib/sui-admin.ts).
/// `key`-only: can never be transferred, wrapped, or listed by anything outside
/// this module, so it can't leak into a Kiosk or a generic transfer PTB.
public struct AdminCap has key {
    id: UID,
}

/// Shared registry enforcing one Stamp per (address, event) on-chain — a second
/// line of defense on top of the Postgres UNIQUE(event_id, profile_id) the
/// backend already enforces before ever calling mint_to.
public struct Registry has key {
    id: UID,
    minted: Table<address, Table<String, ID>>,
}

const EAlreadyMinted: u64 = 0;

fun init(otw: STAMP, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);

    let mut disp = display::new<Stamp>(&publisher, ctx);
    disp.add(b"name".to_string(), b"{event_title}".to_string());
    disp.add(b"description".to_string(), b"WhatsVP Stamp - proof you showed up".to_string());
    disp.add(b"image_url".to_string(), b"https://whatsvp.com/api/stamp-image/{event_id}".to_string());
    disp.update_version();

    transfer::share_object(Registry { id: object::new(ctx), minted: table::new(ctx) });
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
}

/// Mint a Stamp to `recipient`. Requires the backend-held AdminCap — only the
/// server, after verifying a real check-in, can call this successfully. Never
/// call this from a client-built transaction.
public fun mint_to(
    _admin: &AdminCap,
    registry: &mut Registry,
    recipient: address,
    event_id: String,
    event_title: String,
    ctx: &mut TxContext,
) {
    if (!registry.minted.contains(recipient)) {
        registry.minted.add(recipient, table::new(ctx));
    };
    let per_address = registry.minted.borrow_mut(recipient);
    assert!(!per_address.contains(event_id), EAlreadyMinted);

    let id = object::new(ctx);
    let inner = id.to_inner();
    let stamp = Stamp { id, event_id, event_title, checked_in_epoch: ctx.epoch() };

    per_address.add(event_id, inner);
    transfer::transfer(stamp, recipient);
}

/// Whether `who` already holds a Stamp for `event_id` (lets the backend skip a
/// redundant mint attempt on retry).
public fun has_minted(registry: &Registry, who: address, event_id: String): bool {
    if (!registry.minted.contains(who)) return false;
    registry.minted.borrow(who).contains(event_id)
}

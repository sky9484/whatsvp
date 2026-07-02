/// WhatsVP Passport — the free, soulbound identity every user gets on first login.
///
/// `Passport` has the `key` ability ONLY (no `store`), so it can never be
/// transferred or sold — it is bound to the address forever. Minting is one-per-
/// address, enforced by a shared `Registry`. The app triggers the mint right after
/// `/api/auth/session` succeeds, as an Enoki-sponsored (gasless) transaction, so the
/// user never sees crypto UX and never needs SUI.
module whatsvp::passport;

use std::string::String;
use sui::display;
use sui::package;
use sui::table::{Self, Table};

/// One-time witness for Publisher + Display setup.
public struct PASSPORT has drop {}

/// Soulbound identity. `key` only ⇒ non-transferable.
public struct Passport has key {
    id: UID,
    display_name: String,
    joined_epoch: u64,
}

/// Shared registry that enforces one Passport per address.
public struct Registry has key {
    id: UID,
    minted: Table<address, ID>,
}

const EAlreadyMinted: u64 = 0;

fun init(otw: PASSPORT, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);

    // Display so wallets/explorers render the Passport nicely.
    let mut disp = display::new<Passport>(&publisher, ctx);
    disp.add(b"name".to_string(), b"{display_name}".to_string());
    disp.add(b"description".to_string(), b"WhatsVP Passport — soulbound identity for the community scene".to_string());
    disp.add(b"image_url".to_string(), b"https://whatsvp.com/api/passport/{id}/image".to_string());
    disp.update_version();

    // Shared registry for one-per-address enforcement.
    transfer::share_object(Registry { id: object::new(ctx), minted: table::new(ctx) });

    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
}

/// Mint the free soulbound Passport to the sender. Aborts if already minted.
public fun mint(registry: &mut Registry, display_name: String, ctx: &mut TxContext) {
    let sender = ctx.sender();
    assert!(!registry.minted.contains(sender), EAlreadyMinted);

    let id = object::new(ctx);
    let inner = id.to_inner();
    let passport = Passport { id, display_name, joined_epoch: ctx.epoch() };

    registry.minted.add(sender, inner);
    transfer::transfer(passport, sender);
}

/// Whether an address already holds a Passport (used by the app to skip re-mint).
public fun has_minted(registry: &Registry, who: address): bool {
    registry.minted.contains(who)
}

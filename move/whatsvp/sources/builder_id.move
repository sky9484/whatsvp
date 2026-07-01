/// WhatsVP Builder ID — the free, soulbound identity every user gets on first login.
///
/// `BuilderId` has the `key` ability ONLY (no `store`), so it can never be
/// transferred or sold — it is bound to the address forever. Minting is one-per-
/// address, enforced by a shared `Registry`. The app triggers the mint right after
/// `/api/auth/session` succeeds, as an Enoki-sponsored (gasless) transaction, so the
/// user never sees crypto UX and never needs SUI.
module whatsvp::builder_id;

use std::string::String;
use sui::display;
use sui::package;
use sui::table::{Self, Table};

/// One-time witness for Publisher + Display setup.
public struct BUILDER_ID has drop {}

/// Soulbound identity. `key` only ⇒ non-transferable.
public struct BuilderId has key {
    id: UID,
    display_name: String,
    joined_epoch: u64,
}

/// Shared registry that enforces one BuilderId per address.
public struct Registry has key {
    id: UID,
    minted: Table<address, ID>,
}

const EAlreadyMinted: u64 = 0;

fun init(otw: BUILDER_ID, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);

    // Display so wallets/explorers render the Builder ID nicely.
    let mut disp = display::new<BuilderId>(&publisher, ctx);
    disp.add(b"name".to_string(), b"{display_name}".to_string());
    disp.add(b"description".to_string(), b"WhatsVP Builder ID — soulbound identity for the KL builder scene".to_string());
    disp.add(b"image_url".to_string(), b"https://whatsvp.com/api/builder-id/{id}/image".to_string());
    disp.update_version();

    // Shared registry for one-per-address enforcement.
    transfer::share_object(Registry { id: object::new(ctx), minted: table::new(ctx) });

    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
}

/// Mint the free soulbound Builder ID to the sender. Aborts if already minted.
public fun mint(registry: &mut Registry, display_name: String, ctx: &mut TxContext) {
    let sender = ctx.sender();
    assert!(!registry.minted.contains(sender), EAlreadyMinted);

    let id = object::new(ctx);
    let inner = id.to_inner();
    let builder = BuilderId { id, display_name, joined_epoch: ctx.epoch() };

    registry.minted.add(sender, inner);
    transfer::transfer(builder, sender);
}

/// Whether an address already holds a Builder ID (used by the app to skip re-mint).
public fun has_minted(registry: &Registry, who: address): bool {
    registry.minted.contains(who)
}

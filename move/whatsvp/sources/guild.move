/// WhatsVP GuildBadge — a soulbound, per-guild membership badge.
///
/// AUDIT FIX (pre-v4 P0): the original version exposed `mint(guild_slug, ctx)`
/// as a plain public function callable by anyone with any guild_slug string —
/// zero access control, so any address could self-mint a badge for a guild it
/// never joined (confirmed by both the product and Move security audits as the
/// same root bug, CRITICAL). Rebuilt on the exact pattern proven in
/// stamp.move: mint is gated behind a backend-held `AdminCap`, called only
/// from the server (lib/sui-admin.ts) after `/api/guilds/join` has already
/// recorded a real membership row in Postgres. There is deliberately no
/// client-callable mint path left in this module at all.
module whatsvp::guild;

use std::string::String;
use sui::display;
use sui::package;
use sui::table::{Self, Table};

/// One-time witness for Display setup.
public struct GUILD has drop {}

/// Soulbound guild membership badge. `key` only ⇒ non-transferable.
public struct GuildBadge has key {
    id: UID,
    guild_slug: String,
    joined_epoch: u64,
}

/// Held only by the backend signer that verifies real guild membership
/// (lib/sui-admin.ts). `key`-only: can never be transferred, wrapped, or
/// listed by anything outside this module.
public struct AdminCap has key {
    id: UID,
}

/// Shared registry enforcing one GuildBadge per (address, guild) on-chain — a
/// second line of defense on top of guild_members' Postgres primary key,
/// mirroring stamp.move's Registry shape exactly.
public struct Registry has key {
    id: UID,
    minted: Table<address, Table<String, ID>>,
}

const EAlreadyMinted: u64 = 0;

fun init(otw: GUILD, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let mut disp = display::new<GuildBadge>(&publisher, ctx);
    disp.add(b"name".to_string(), b"{guild_slug} · WhatsVP Guild".to_string());
    disp.add(b"description".to_string(), b"Soulbound membership badge for a WhatsVP guild".to_string());
    disp.add(b"image_url".to_string(), b"https://whatsvp.com/api/guilds/{guild_slug}/badge".to_string());
    disp.update_version();

    transfer::share_object(Registry { id: object::new(ctx), minted: table::new(ctx) });
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
}

/// Mint a soulbound GuildBadge to `recipient`. Requires the backend-held
/// AdminCap — only the server, after verifying real membership, can call this
/// successfully. Never call this from a client-built transaction.
public fun mint_to(
    _admin: &AdminCap,
    registry: &mut Registry,
    recipient: address,
    guild_slug: String,
    ctx: &mut TxContext,
) {
    if (!registry.minted.contains(recipient)) {
        registry.minted.add(recipient, table::new(ctx));
    };
    let per_address = registry.minted.borrow_mut(recipient);
    assert!(!per_address.contains(guild_slug), EAlreadyMinted);

    let id = object::new(ctx);
    let inner = id.to_inner();
    let badge = GuildBadge { id, guild_slug, joined_epoch: ctx.epoch() };

    per_address.add(guild_slug, inner);
    transfer::transfer(badge, recipient);
}

/// Whether `who` already holds a GuildBadge for `guild_slug` (lets the backend
/// skip a redundant mint attempt on retry).
public fun has_minted(registry: &Registry, who: address, guild_slug: String): bool {
    if (!registry.minted.contains(who)) return false;
    registry.minted.borrow(who).contains(guild_slug)
}

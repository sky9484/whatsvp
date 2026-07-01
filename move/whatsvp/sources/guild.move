/// WhatsVP GuildBadge — a soulbound, per-guild membership badge.
///
/// Minted (Enoki-sponsored, gasless) when a user joins a guild. `key`-only ⇒
/// non-transferable. The app calls `mint` after `/api/guilds/join` records the
/// membership row, so the on-chain badge mirrors the off-chain roster.
module whatsvp::guild;

use std::string::String;
use sui::display;
use sui::package;

/// One-time witness for Display setup.
public struct GUILD has drop {}

/// Soulbound guild membership badge. `key` only ⇒ non-transferable.
public struct GuildBadge has key {
    id: UID,
    guild_slug: String,
    joined_epoch: u64,
}

fun init(otw: GUILD, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let mut disp = display::new<GuildBadge>(&publisher, ctx);
    disp.add(b"name".to_string(), b"{guild_slug} · WhatsVP Guild".to_string());
    disp.add(b"description".to_string(), b"Soulbound membership badge for a WhatsVP guild".to_string());
    disp.add(b"image_url".to_string(), b"https://whatsvp.com/api/guilds/{guild_slug}/badge".to_string());
    disp.update_version();

    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
}

/// Mint a soulbound GuildBadge to the sender (sponsored). Called on guild join.
public fun mint(guild_slug: String, ctx: &mut TxContext) {
    let badge = GuildBadge { id: object::new(ctx), guild_slug, joined_epoch: ctx.epoch() };
    transfer::transfer(badge, ctx.sender());
}

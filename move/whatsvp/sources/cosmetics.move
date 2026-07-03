/// WhatsVP cosmetics — tradable avatar NFTs (paid, optional, cosmetic only).
///
/// `Avatar` has `store`, so it can enter a Sui Kiosk and be sold/traded. A
/// royalty-enabled `TransferPolicy<Avatar>` is published so WhatsVP earns on
/// secondary sales. Purchases are priced in USDC with gas sponsored via Enoki.
/// Cosmetics are NEVER required to onboard — the free soulbound Passport is the
/// default identity; avatars only change appearance.
module whatsvp::cosmetics;

use std::string::String;
use sui::display;
use sui::package;
use sui::transfer_policy;
use sui::url::{Self, Url};

/// One-time witness for Publisher/Display/TransferPolicy setup.
public struct COSMETICS has drop {}

/// Tradable avatar. `store` ⇒ can enter a Kiosk.
public struct Avatar has key, store {
    id: UID,
    name: String,
    image_url: Url,
    traits: vector<String>,
}

/// Capability held by WhatsVP to mint new cosmetics for sale.
/// AUDIT FIX (pre-v4 P0): originally had `store`, which let the sole
/// mint-gating capability be wrapped, listed in a Kiosk, or moved via any
/// generic store-based mechanism outside this module's control. `key`-only
/// mirrors stamp.move's and guild.move's AdminCap — the correct shape for any
/// capability that gates minting.
public struct MintCap has key {
    id: UID,
}

fun init(otw: COSMETICS, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);

    let mut disp = display::new<Avatar>(&publisher, ctx);
    disp.add(b"name".to_string(), b"{name}".to_string());
    disp.add(b"image_url".to_string(), b"{image_url}".to_string());
    disp.add(b"description".to_string(), b"WhatsVP cosmetic avatar".to_string());
    disp.update_version();

    // Royalty-enabled transfer policy for secondary Kiosk sales.
    // Attach a concrete royalty rule (e.g. mysten `royalty_rule`) at publish time
    // with the desired basis points; the policy + cap are created here.
    let (policy, policy_cap) = transfer_policy::new<Avatar>(&publisher, ctx);
    transfer::public_share_object(policy);
    transfer::public_transfer(policy_cap, ctx.sender());

    transfer::transfer(MintCap { id: object::new(ctx) }, ctx.sender());
    transfer::public_transfer(publisher, ctx.sender());
    transfer::public_transfer(disp, ctx.sender());
}

/// Mint a cosmetic avatar (WhatsVP-only, gated by MintCap). Returned for listing in a Kiosk.
public fun mint(
    _cap: &MintCap,
    name: String,
    image_url: vector<u8>,
    traits: vector<String>,
    ctx: &mut TxContext,
): Avatar {
    Avatar {
        id: object::new(ctx),
        name,
        image_url: url::new_unsafe_from_bytes(image_url),
        traits,
    }
}

"use client";

import { useState } from "react";
import { BadgeCheck, Copy, Download, Printer, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type Props = {
  name: string;
  address: string;
  canonicalUrl: string;
  verifiedAt: string | null;
};

export function RestroomShareTools({ name, address, canonicalUrl, verifiedAt }: Props) {
  const [notice, setNotice] = useState("");
  const isVerified = Boolean(verifiedAt);

  async function copyLink() {
    await navigator.clipboard.writeText(canonicalUrl);
    setNotice("Listing link copied.");
  }

  async function share() {
    const data = { title: `${name} on IWANNAPEE`, text: `${name} — ${address}`, url: canonicalUrl };
    if (navigator.share) await navigator.share(data);
    else await copyLink();
  }

  async function downloadCard() {
    const svg = document.querySelector<SVGElement>("#verification-card-qr svg");
    if (!svg) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#eef3ef";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#173c2c";
    context.fillRect(0, 0, 32, canvas.height);
    context.fillStyle = "#17231d";
    context.font = "700 34px Arial, sans-serif";
    context.fillText("IWANNAPEE", 88, 86);
    context.fillStyle = isVerified ? "#245e43" : "#776739";
    context.font = "700 22px Arial, sans-serif";
    context.fillText(isVerified ? "COMMUNITY VERIFIED RESTROOM" : "HELP VERIFY THIS RESTROOM", 88, 142);
    context.fillStyle = "#17231d";
    context.font = "700 48px Arial, sans-serif";
    const title = name.length > 38 ? `${name.slice(0, 35)}…` : name;
    context.fillText(title, 88, 238);
    context.fillStyle = "#56625c";
    context.font = "24px Arial, sans-serif";
    const addressText = address.length > 64 ? `${address.slice(0, 61)}…` : address;
    context.fillText(addressText, 88, 288);
    context.fillStyle = "#17231d";
    context.font = "700 23px Arial, sans-serif";
    context.fillText("Scan for directions, access details and community updates", 88, 430);
    context.fillStyle = "#56625c";
    context.font = "20px Arial, sans-serif";
    context.fillText("iwannapee.lol", 88, 472);

    const serialized = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("QR card could not be generated"));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    });
    context.fillStyle = "#ffffff";
    context.fillRect(830, 115, 280, 280);
    context.drawImage(image, 850, 135, 240, 240);
    context.fillStyle = "#56625c";
    context.font = "700 17px Arial, sans-serif";
    context.fillText("SCAN TO OPEN", 902, 430);
    const link = document.createElement("a");
    link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-iwannapee.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setNotice("Verification card downloaded.");
  }

  return (
    <section className="restroom-share-card" aria-labelledby="share-card-title">
      <div className="restroom-share-card-copy">
        <span className={isVerified ? "verification-status verified" : "verification-status"}><BadgeCheck size={16} /> {isVerified ? "Community Verified" : "Community verification needed"}</span>
        <h2 id="share-card-title">Put this restroom on the map.</h2>
        <p>Share the listing online or print the QR badge for the restroom entrance. The QR always opens this live listing.</p>
        <div className="restroom-share-actions">
          <button className="button button-primary" onClick={share} type="button"><Share2 size={17} /> Share</button>
          <button className="button button-secondary" onClick={copyLink} type="button"><Copy size={17} /> Copy link</button>
          <button className="button button-secondary" onClick={downloadCard} type="button"><Download size={17} /> Download card</button>
          <button className="button button-secondary" onClick={() => window.print()} type="button"><Printer size={17} /> Print badge</button>
        </div>
        {notice ? <p className="share-notice" role="status">{notice}</p> : null}
      </div>
      <div className="verification-print-badge">
        <span>IWANNAPEE</span>
        <strong>{isVerified ? "Community Verified Restroom" : "Help verify this restroom"}</strong>
        <div id="verification-card-qr"><QRCodeSVG bgColor="#ffffff" fgColor="#17231d" level="M" marginSize={2} size={152} value={canonicalUrl} /></div>
        <b>{name}</b>
        <small>Scan for live access details</small>
      </div>
    </section>
  );
}

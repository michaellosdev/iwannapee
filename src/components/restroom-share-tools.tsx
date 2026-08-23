"use client";

import Image from "next/image";
import { useState } from "react";
import { BadgeCheck, Copy, Download, MapPin, Printer, Share2, Star } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type Props = {
  name: string;
  address: string;
  canonicalUrl: string;
  rating: number;
  reviewCount: number;
  verifiedAt: string | null;
};

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);

  const includedWordCount = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (includedWordCount < words.length && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last && context.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trim();
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function loadCanvasImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Poster artwork could not be loaded"));
    image.src = source;
  });
}

export function RestroomShareTools({ name, address, canonicalUrl, rating, reviewCount, verifiedAt }: Props) {
  const [notice, setNotice] = useState("");
  const isVerified = Boolean(verifiedAt);
  const ratingLabel = reviewCount > 0 ? rating.toFixed(1) : "New";
  const reviewLabel = reviewCount > 0
    ? `${reviewCount.toLocaleString()} community ${reviewCount === 1 ? "review" : "reviews"}`
    : "Be the first to rate it";

  async function copyLink() {
    await navigator.clipboard.writeText(canonicalUrl);
    setNotice("Listing link copied.");
  }

  async function share() {
    const data = { title: `${name} on IWANNAPEE`, text: `${name} — ${address}`, url: canonicalUrl };
    if (navigator.share) await navigator.share(data);
    else await copyLink();
  }

  async function downloadPoster() {
    const svg = document.querySelector<SVGElement>("#verification-card-qr svg");
    if (!svg) return;

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) return;

    const background = context.createLinearGradient(0, 0, 1200, 1200);
    background.addColorStop(0, "#87e4fb");
    background.addColorStop(0.55, "#d9f7ff");
    background.addColorStop(1, "#a4eafa");
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const bubbles = [
      [1040, 95, 82, 0.32],
      [1102, 245, 30, 0.5],
      [84, 1085, 76, 0.28],
      [188, 1032, 24, 0.48],
      [1115, 1018, 54, 0.28],
    ] as const;
    for (const [x, y, radius, opacity] of bubbles) {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      context.fill();
      context.lineWidth = 4;
      context.strokeStyle = `rgba(0, 174, 227, ${Math.min(opacity + 0.15, 0.7)})`;
      context.stroke();
    }

    const logo = await loadCanvasImage("/brand/iwannapee-logo.webp").catch(() => null);
    if (logo) context.drawImage(logo, 64, 48, 126, 126);
    context.fillStyle = "#001d3f";
    context.font = "900 48px Arial, sans-serif";
    context.fillText("IWANNAPEE", 210, 102);
    context.fillStyle = "#006cae";
    context.font = "900 19px Arial, sans-serif";
    context.letterSpacing = "2px";
    context.fillText("YOU HAVE THE RIGHT TO PEE.", 212, 140);
    context.letterSpacing = "0px";

    roundedRect(context, 58, 205, 1084, 790, 54);
    context.fillStyle = "rgba(255, 255, 255, 0.94)";
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = "#00aee3";
    context.stroke();

    const statusText = isVerified ? "✓ COMMUNITY VERIFIED" : "COMMUNITY CHECK NEEDED";
    context.font = "900 21px Arial, sans-serif";
    const statusWidth = context.measureText(statusText).width + 46;
    roundedRect(context, 108, 258, statusWidth, 52, 26);
    context.fillStyle = isVerified ? "#d6f7fb" : "#fff3b8";
    context.fill();
    context.fillStyle = isVerified ? "#006b7c" : "#7a5700";
    context.fillText(statusText, 131, 292);

    context.fillStyle = "#001d3f";
    context.font = "900 58px Arial, sans-serif";
    const titleLines = wrapText(context, name, 620, 3);
    titleLines.forEach((line, index) => context.fillText(line, 108, 382 + index * 66));
    const titleBottom = 382 + Math.max(0, titleLines.length - 1) * 66;

    context.fillStyle = "#4b6980";
    context.font = "500 28px Arial, sans-serif";
    const addressLines = wrapText(context, address, 620, 3);
    addressLines.forEach((line, index) => context.fillText(line, 108, titleBottom + 60 + index * 38));

    const ratingY = Math.max(620, titleBottom + 60 + addressLines.length * 38 + 30);
    roundedRect(context, 108, ratingY, 414, 104, 26);
    context.fillStyle = "#001d3f";
    context.fill();
    context.fillStyle = "#42dafa";
    context.font = "900 43px Arial, sans-serif";
    context.fillText(`★ ${ratingLabel}`, 137, ratingY + 53);
    context.fillStyle = "#d9f8ff";
    context.font = "700 18px Arial, sans-serif";
    context.fillText(reviewLabel, 139, ratingY + 81);

    const serializedQr = new XMLSerializer().serializeToString(svg);
    const qrImage = await loadCanvasImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializedQr)}`);
    roundedRect(context, 760, 280, 324, 324, 38);
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = "#001d3f";
    context.stroke();
    context.drawImage(qrImage, 790, 310, 264, 264);
    context.fillStyle = "#001d3f";
    context.textAlign = "center";
    context.font = "900 26px Arial, sans-serif";
    context.fillText("SCAN BEFORE YOU GO", 922, 658);
    context.fillStyle = "#4b6980";
    context.font = "700 18px Arial, sans-serif";
    context.fillText("Directions · hours · access · reviews", 922, 692);
    context.textAlign = "left";

    context.fillStyle = "#006cae";
    context.font = "900 20px Arial, sans-serif";
    context.fillText("LIVE RESTROOM INFO", 108, 838);
    context.fillStyle = "#001d3f";
    context.font = "900 35px Arial, sans-serif";
    context.fillText("Know before you go.", 108, 886);
    context.fillStyle = "#4b6980";
    context.font = "500 23px Arial, sans-serif";
    context.fillText("Scan for the latest community updates and access details.", 108, 927);

    roundedRect(context, 58, 1032, 1084, 112, 38);
    context.fillStyle = "#001d3f";
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = "700 22px Arial, sans-serif";
    context.fillText("POWERED BY", 104, 1099);
    context.fillStyle = "#42dafa";
    context.font = "900 34px Arial, sans-serif";
    context.fillText("iwannapee.lol", 262, 1101);
    context.fillStyle = "#d9f8ff";
    context.font = "700 18px Arial, sans-serif";
    context.textAlign = "right";
    context.fillText("Community-powered restroom access", 1094, 1096);
    context.textAlign = "left";

    const link = document.createElement("a");
    link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-iwannapee-poster.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setNotice("Square poster downloaded.");
  }

  return (
    <section className="restroom-share-card" aria-labelledby="share-card-title">
      <div className="restroom-share-card-copy">
        <span className={isVerified ? "verification-status verified" : "verification-status"}><BadgeCheck size={16} /> {isVerified ? "Community Verified" : "Community verification needed"}</span>
        <h2 id="share-card-title">Share this restroom with the neighborhood.</h2>
        <p>Download a cute square poster for the entrance or social media. Its QR always opens this live listing with the latest access information.</p>
        <div className="restroom-share-actions">
          <button className="button button-primary" onClick={share} type="button"><Share2 size={17} /> Share</button>
          <button className="button button-secondary" onClick={copyLink} type="button"><Copy size={17} /> Copy link</button>
          <button className="button button-secondary" onClick={downloadPoster} type="button"><Download size={17} /> Download poster</button>
          <button className="button button-secondary" onClick={() => window.print()} type="button"><Printer size={17} /> Print poster</button>
        </div>
        {notice ? <p className="share-notice" role="status">{notice}</p> : null}
      </div>

      <div className="verification-print-badge" aria-label="Square restroom poster preview">
        <div className="poster-bubble poster-bubble-one" />
        <div className="poster-bubble poster-bubble-two" />
        <div className="poster-brand-row">
          <Image alt="" height={512} src="/brand/iwannapee-logo.webp" width={512} />
          <span><strong>IWANNAPEE</strong><small>You have the right to pee.</small></span>
        </div>
        <div className="poster-information-card">
          <span className={isVerified ? "poster-verification verified" : "poster-verification"}><BadgeCheck size={12} /> {isVerified ? "Community verified" : "Community check needed"}</span>
          <h3>{name}</h3>
          <p><MapPin size={13} /> {address}</p>
          <div className="poster-rating"><Star fill="currentColor" size={17} /><strong>{ratingLabel}</strong><span>{reviewLabel}</span></div>
          <div className="poster-qr" id="verification-card-qr"><QRCodeSVG bgColor="#ffffff" fgColor="#001d3f" level="M" marginSize={2} size={152} value={canonicalUrl} /></div>
          <b>Scan before you go</b>
          <small>Directions · hours · access · reviews</small>
        </div>
        <div className="poster-powered-by"><span>Powered by</span><strong>iwannapee.lol</strong></div>
      </div>
    </section>
  );
}

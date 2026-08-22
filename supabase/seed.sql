-- Optional Los Angeles demo data. These are illustrative product records, not live-verified listings.
insert into public.restrooms (
  id, name, address, description, directions, hours, latitude, longitude,
  is_open_now, access_code, access_instructions, cover_photo_url, features,
  rating, cleanliness_rating, review_count, status, last_verified_at
) values
(
  '17f4790b-4528-4389-b942-1621026b657f',
  'Grand Park Welcome Center',
  '200 N Grand Ave, Los Angeles, CA',
  'Bright public facilities beside the splash pad with attendants nearby during park hours.',
  'Enter from Grand Avenue and follow signs beside the splash pad.',
  '5:30 AM–10:00 PM', 34.055478, -118.245083, true, null,
  'No purchase or code required.',
  'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=85',
  array['Accessible', 'Baby changing', 'Gender neutral', 'Free'],
  4.80, 4.70, 126, 'published', now()
),
(
  '68f48d88-6548-4760-98b1-577853433728',
  'Central Library — Lower Level',
  '630 W 5th St, Los Angeles, CA',
  'Well-maintained multi-stall restroom inside the library. A library card is not needed to enter.',
  'Use the Flower Street entrance, then take the escalator down one level.',
  '10:00 AM–8:00 PM', 34.050495, -118.255075, true, null,
  'Ask the information desk if the lower-level door is closed.',
  'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=1200&q=85',
  array['Accessible', 'Baby changing', 'Free'],
  4.60, 4.80, 89, 'published', now()
),
(
  'c164bbd8-c286-431f-bdf1-228a8d551841',
  'Little Tokyo Market Restroom',
  '333 S Alameda St, Los Angeles, CA',
  'Single-stall restroom near the food court. Usually quiet before the lunch rush.',
  'Enter the market and turn left after the bakery counter.',
  '8:00 AM–9:00 PM', 34.045184, -118.238155, true, '2026#',
  'Demo code; replace with a freshly verified code before launch.',
  'https://images.unsplash.com/photo-1564540583246-934409427776?auto=format&fit=crop&w=1200&q=85',
  array['Gender neutral', 'Single stall', 'Code available'],
  4.40, 4.50, 54, 'published', now()
)
on conflict (id) do nothing;

-- Two event banners pointed at places the site can't rely on: a developer's machine (http://localhost:4000/uploads/…,
-- broken everywhere else) and Base44's media host (the portal must not depend on Base44). Both images now ship with
-- the frontend under /images/events/. Only rows still holding exactly the old URL change; anything an admin has
-- already replaced stays as it is. Data only.
UPDATE `events` SET `banner_url` = '/images/events/sneh-deepotsav-2026.jpg'
WHERE `banner_url` = 'http://localhost:4000/uploads/580cbbd9-0d86-4982-83d9-37ebe2b98375.jpg';

UPDATE `events` SET `banner_url` = '/images/events/navratri-garba-mahotsav-2026.jpg'
WHERE `banner_url` = 'https://media.base44.com/images/public/6aa8eddb31c7f687e4703b10/a9aa38eca_generated_image.png';

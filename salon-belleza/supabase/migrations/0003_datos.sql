-- Neiva Belleza · 3/3 · Datos iniciales (catálogo, equipo, productos, festivos y datos del salón)
-- Se pueden cambiar después desde el panel, sin tocar código.

insert into public.categorias (id, nombre, duracion_texto, orden) values
  ('cabello', 'Cabello', '60 – 120 min', 1),
  ('unas', 'Uñas', '45 – 60 min', 2),
  ('maquillaje', 'Maquillaje', '30 – 120 min', 3),
  ('spa', 'Spa facial', '60 – 90 min', 4);

insert into public.servicios (id, categoria_id, nombre, detalle, precio, minutos, ajustes_largo, limpieza_min, cuidados, precio_antes, activo, orden) values
  ('corte', 'cabello', 'Corte & estilizado', 'Corte personalizado, brushing y acabado', 45000, 60, '{"largo": {"precio": 10000, "minutos": 15}, "medio": {"precio": 5000, "minutos": 0}}'::jsonb, 0, 'Usa protector térmico antes de planchar o secar.', null, true, 1),
  ('mani-clasica', 'unas', 'Manicura clásica', 'Cuidado y esmaltado tradicional', 30000, 45, null, 0, 'Espera 2 horas antes de lavar platos sin guantes.', null, true, 1),
  ('maq-social', 'maquillaje', 'Maquillaje social', 'Look natural o glamoroso para evento', 120000, 60, null, 0, 'Retira el maquillaje con desmaquillante bifásico antes de dormir.', null, true, 1),
  ('limpieza', 'spa', 'Limpieza profunda', 'Extracción, exfoliación y mascarilla', 90000, 60, null, 10, 'Evita el sol y el maquillaje por 24 horas. Usa protector solar.', null, true, 1),
  ('hidra-facial', 'spa', 'Hidratación facial', 'Ácido hialurónico y luminosidad', 110000, 60, null, 10, 'Bebe mucha agua y usa protector solar.', null, true, 2),
  ('color', 'cabello', 'Coloración profesional', 'Balayage, mechas o color global', 160000, 120, '{"largo": {"precio": 60000, "minutos": 60}, "medio": {"precio": 30000, "minutos": 30}}'::jsonb, 15, 'No laves el cabello en 48 horas. Usa shampoo sin sulfatos para cabello teñido.', null, true, 2),
  ('maq-novia', 'maquillaje', 'Maquillaje de novia', 'Incluye prueba y fijación prolongada', 280000, 120, null, 0, 'Lleva el labial del look para retoques durante la fiesta.', null, true, 2),
  ('mani-semi', 'unas', 'Manicura semipermanente', 'Duración hasta 3 semanas', 45000, 60, null, 0, 'Aplica aceite de cutícula a diario. No uses las uñas como herramienta.', null, true, 2),
  ('masaje', 'spa', 'Masaje relajante', 'Aromaterapia y piedras calientes', 120000, 90, null, 10, 'Toma agua y descansa el resto del día.', null, true, 3),
  ('pedi-spa', 'unas', 'Pedicura spa', 'Exfoliación, hidratación y esmaltado', 60000, 60, null, 0, 'Usa sandalias abiertas el resto del día.', null, true, 3),
  ('cejas', 'maquillaje', 'Cejas: perfilado & tinte', 'Diseño y tono natural', 35000, 30, null, 0, 'No mojes las cejas en 24 horas.', null, true, 3),
  ('hidratante', 'cabello', 'Tratamiento hidratante', 'Nutrición profunda, brillo y suavidad', 90000, 60, '{"largo": {"precio": 20000, "minutos": 15}, "medio": {"precio": 10000, "minutos": 0}}'::jsonb, 0, 'Evita el agua con cloro durante 3 días.', null, true, 3);

insert into public.disenos (id, nombre, categoria, detalle, precio, foto, activo, orden) values
  ('minimal-milk', 'Minimal Milk', 'Minimal', 'Acabado natural, brillo saludable', 45000, 'img/minimal-milk.jpg', true, 1),
  ('floral-nude', 'Floral Nude', 'Minimal', 'Flores pintadas a mano sobre base nude', 55000, 'img/floral-nude.jpg', true, 2),
  ('french-clasico', 'French Clásico', 'French', 'Tip francés tradicional, elegante', 52000, 'img/french-clasico.jpg', true, 3),
  ('french-perlado', 'French Perlado', 'French', 'French con detalles de perla, romántico', 58000, 'img/french-perlado.jpg', true, 4),
  ('chrome-espejo', 'Chrome Espejo', 'Chrome', 'Efecto espejo cromado, futurista', 65000, 'img/chrome-espejo.jpg', true, 5),
  ('chrome-rosa', 'Chrome Rosa', 'Chrome', 'Rosa dorado con acabado metálico', 65000, 'img/chrome-rosa.jpg', true, 6),
  ('almond-nude', 'Almond Nude', 'Almond', 'Almendra nude lisa, look natural premium', 48000, 'img/almond-nude.jpg', true, 7),
  ('golden-pearl', 'Golden Pearlescent', 'Almond', 'Perlado dorado con brillo delicado', 62000, 'img/golden-pearl.jpg', true, 8);

insert into public.profesionales (id, nombre, rol, especialidad, categorias, rating, resenas, tono, dias, hora_inicio, hora_fin, nivel, comision_servicio, comision_producto, bio, certificados, portafolio, activo, orden) values
  ('sofia', 'Sofía Martínez', 'Manicurista', 'Uñas en gel & nail art', '{"unas"}', 4.9, 124, '{"#e8c3b5","#c98f88"}', '{2,3,4,5,6}', '09:00:00', '18:00:00', 'senior', 0.4, 0.1, 'Especialista en nail art y uñas esculpidas con 8 años de experiencia.', '{"Nail art avanzado","Gel y acrílico"}', '[]'::jsonb, true, 1),
  ('camila', 'Camila Reyes', 'Manicurista', 'Manicura de lujo & diseño', '{"unas"}', 4.9, 210, '{"#d9b49a","#a8735c"}', '{1,2,3,4,5}', '10:00:00', '19:00:00', 'senior', 0.4, 0.1, 'Amante de los acabados chrome y el detalle perfecto.', '{"Manicura rusa"}', '[]'::jsonb, true, 2),
  ('valentina', 'Valentina Ríos', 'Estilista', 'Colorimetría & balayage', '{"cabello"}', 4.8, 98, '{"#f0d2c4","#d39a93"}', '{1,2,3,4,5,6}', '09:00:00', '17:00:00', 'senior', 0.4, 0.1, 'Colorista certificada, experta en rubios y balayage.', '{"Colorimetría avanzada"}', '[]'::jsonb, true, 3),
  ('andres', 'Andrés Cárdenas', 'Peluquero', 'Cortes, barbería & peinados', '{"cabello"}', 4.9, 156, '{"#d8c3b8","#7d5c52"}', '{1,2,3,4,5,6}', '11:00:00', '19:00:00', 'senior', 0.4, 0.1, 'Cortes modernos para todo tipo de cabello.', '{"Barbería clásica","Corte en seco"}', '[]'::jsonb, true, 4),
  ('mariana', 'Mariana López', 'Estilista', 'Cortes & peinados de evento', '{"cabello","maquillaje"}', 4.8, 132, '{"#f3ddd2","#c4877c"}', '{1,2,3,5,6}', '09:00:00', '18:00:00', 'senior', 0.4, 0.1, 'Peinados para novias, quinceañeras y grados.', '{"Peinado de novia"}', '[]'::jsonb, true, 5),
  ('daniela', 'Daniela Ortiz', 'Maquilladora', 'Maquillaje & cejas', '{"maquillaje"}', 4.7, 76, '{"#efd9cc","#b8946a"}', '{3,4,5,6}', '10:00:00', '19:00:00', 'junior', 0.4, 0.1, 'Maquillaje social y de novia de larga duración.', '{"Maquillaje profesional"}', '[]'::jsonb, true, 6),
  ('laura', 'Laura Gómez', 'Esteticista', 'Spa facial & masajes', '{"spa"}', 4.8, 88, '{"#e9d6d0","#9d7b84"}', '{1,2,4,5,6}', '09:00:00', '18:00:00', 'senior', 0.4, 0.1, 'Esteticista con enfoque en piel sensible.', '{"Cosmetología","Masaje terapéutico"}', '[]'::jsonb, true, 7);

insert into public.productos (id, nombre, detalle, precio, foto, stock, stock_minimo, ingredientes, modo_uso, categoria, activo, orden) values
  ('serum-rosa', 'Sérum de Rosa', 'Hidratante con pétalos de rosa · 30 ml', 98000, 'img/p-serum-rosa.jpg', 5, 5, 'Agua de rosas, ácido hialurónico, vitamina E', 'Aplica 3 gotas en el rostro limpio, mañana y noche.', 'facial', true, 1),
  ('aceite-facial', 'Aceite facial nutritivo', 'Jojoba y rosa mosqueta · 15 ml', 76000, 'img/p-aceite-facial.jpg', 8, 5, 'Aceite de jojoba, rosa mosqueta', '2 gotas en la noche sobre piel limpia.', 'facial', true, 2),
  ('esmalte-nude', 'Esmalte Nude · Tono 04', 'Larga duración, libre de 10 tóxicos · 10 ml', 28000, 'img/p-esmalte-nude.jpg', 14, 5, 'Fórmula 10-free', 'Dos capas finas y top coat.', 'unas', true, 3),
  ('aceite-cuticula', 'Aceite de cutícula', 'Argán y vitamina E · 15 ml', 22000, 'img/p-aceite-cuticula.jpg', 3, 5, 'Aceite de argán, vitamina E', 'Una gota por uña cada noche.', 'unas', true, 4),
  ('shampoo', 'Shampoo nutritivo', 'Sin sulfatos, con aceite de argán · 250 ml', 32000, 'img/p-shampoo.jpg', 20, 5, 'Aceite de argán, keratina', 'Masajea y enjuaga. Ideal para cabello teñido.', 'cabello', true, 5),
  ('esmalte-rose', 'Esmalte Rosé Ivory', 'Brillo intenso, secado rápido · 12 ml', 28000, 'img/p-esmalte-rose.jpg', 11, 5, 'Fórmula 10-free', 'Dos capas finas y top coat.', 'unas', true, 6);

-- Festivos de Colombia 2026 y 2027 (el salón cierra)
insert into public.festivos (fecha) values
  ('2026-01-01'),
  ('2026-01-12'),
  ('2026-03-23'),
  ('2026-04-02'),
  ('2026-04-03'),
  ('2026-05-01'),
  ('2026-05-18'),
  ('2026-06-08'),
  ('2026-06-15'),
  ('2026-06-29'),
  ('2026-07-20'),
  ('2026-08-07'),
  ('2026-08-17'),
  ('2026-10-12'),
  ('2026-11-02'),
  ('2026-11-16'),
  ('2026-12-08'),
  ('2026-12-25'),
  ('2027-01-01'),
  ('2027-01-11'),
  ('2027-03-22'),
  ('2027-03-25'),
  ('2027-03-26'),
  ('2027-05-01'),
  ('2027-05-10'),
  ('2027-05-31'),
  ('2027-06-07'),
  ('2027-07-05'),
  ('2027-07-20'),
  ('2027-08-07'),
  ('2027-08-16'),
  ('2027-10-18'),
  ('2027-11-01'),
  ('2027-11-15'),
  ('2027-12-08'),
  ('2027-12-25');

insert into public.config (clave, valor, publica) values
  ('salon', '{"lat": 2.9273, "lng": -75.2819, "email": "hola@neivabelleza.co", "nombre": "Neiva Belleza", "horario": "Lunes a sábado: 9:00 a.m. – 7:00 p.m.", "whatsapp": "573001234567", "direccion": "Carrera 5 # 12-34, Neiva, Huila", "instagram": "@neivabelleza", "whatsappVisible": "+57 300 123 4567"}'::jsonb, true),
  ('integraciones', '{"metaPixelId": "", "googleReviewUrl": "", "googleAnalyticsId": "", "asistenteActivo": false}'::jsonb, true),
  ('fidelidad', '{"sellosParaPremio": 10, "premio": "Manicura clásica gratis"}'::jsonb, true);

-- Cupón de bienvenida para la primera reserva online
insert into public.cupones (codigo, descripcion, tipo, valor) values ('BIENVENIDA', '10% de descuento en tu primera reserva online', 'porcentaje', 10);

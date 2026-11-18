-- Neiva Belleza · 1/3 · Tablas y reglas de acceso (RLS)
-- Para reconstruir la base desde cero: ejecuta 0001, 0002 y 0003 en orden en Supabase → SQL Editor.

create extension if not exists btree_gist with schema extensions;

-- ===== CATÁLOGO (lo ve todo el mundo, lo edita el salón) =====
create table public.categorias (
  id text primary key,
  nombre text not null,
  duracion_texto text not null default '',
  orden int not null default 99
);

create table public.servicios (
  id text primary key,
  categoria_id text not null references public.categorias (id),
  nombre text not null,
  detalle text not null default '',
  precio int not null check (precio >= 0),
  minutos int not null check (minutos > 0),
  ajustes_largo jsonb,
  limpieza_min int not null default 0 check (limpieza_min >= 0),
  cuidados text,
  precio_antes int check (precio_antes >= 0),
  activo boolean not null default true,
  orden int not null default 99
);

create table public.disenos (
  id text primary key,
  nombre text not null,
  categoria text not null default '',
  detalle text not null default '',
  precio int not null check (precio >= 0),
  foto text,
  activo boolean not null default true,
  orden int not null default 99
);

create table public.profesionales (
  id text primary key,
  nombre text not null,
  rol text not null default 'Estilista',
  especialidad text not null default '',
  categorias text[] not null default '{}',
  rating numeric(2, 1) not null default 5.0,
  resenas int not null default 0,
  tono text[] not null default '{"#e8c3b5","#c98f88"}',
  dias int[] not null default '{1,2,3,4,5,6}',
  hora_inicio time not null default '09:00',
  hora_fin time not null default '18:00',
  nivel text not null default 'senior',
  comision_servicio numeric(4, 3) not null default 0.4 check (comision_servicio between 0 and 1),
  comision_producto numeric(4, 3) not null default 0.1 check (comision_producto between 0 and 1),
  bio text,
  certificados text[] not null default '{}',
  portafolio jsonb not null default '[]',
  activo boolean not null default true,
  orden int not null default 99
);

create table public.productos (
  id text primary key,
  nombre text not null,
  detalle text not null default '',
  precio int not null check (precio >= 0),
  foto text,
  stock int not null default 0,
  stock_minimo int not null default 5,
  ingredientes text,
  modo_uso text,
  categoria text,
  activo boolean not null default true,
  orden int not null default 99
);

create table public.festivos (
  fecha date primary key,
  nombre text not null default 'Festivo'
);

create table public.config (
  clave text primary key,
  valor jsonb not null default '{}',
  publica boolean not null default false
);

-- ===== EQUIPO Y CUENTAS =====
create table public.perfiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '',
  rol text not null check (rol in ('duena', 'recepcion', 'estilista')),
  profesional_id text references public.profesionales (id) on delete set null,
  creada timestamptz not null default now()
);

create table public.solicitudes_acceso (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text not null default '',
  aprobada boolean not null default false,
  creada timestamptz not null default now()
);

-- ===== CLIENTAS Y CITAS =====
create table public.clientas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null unique,
  email text,
  cumpleanos date,
  alergias text not null default '',
  notas text not null default '',
  etiquetas text[] not null default '{}',
  sellos int not null default 0,
  puntos int not null default 0,
  acepta_promos boolean not null default false,
  codigo_referido text unique,
  referida_por uuid references public.clientas (id) on delete set null,
  profesional_favorita text references public.profesionales (id) on delete set null,
  creada timestamptz not null default now()
);

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  token uuid not null unique default gen_random_uuid(),
  clienta_id uuid not null references public.clientas (id) on delete cascade,
  profesional_id text not null references public.profesionales (id),
  inicio timestamptz not null,
  fin timestamptz not null,
  servicios jsonb not null default '[]',
  productos jsonb not null default '[]',
  largo text,
  subtotal int not null default 0,
  descuento int not null default 0,
  cupon text,
  total int not null default 0,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'en_curso', 'terminada', 'cancelada', 'no_asistio')),
  origen text not null default 'web',
  nota text not null default '',
  recordatorio_enviado boolean not null default false,
  recordatorio_error text,
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  check (fin > inicio),
  -- Dos citas activas de la misma profesional nunca se cruzan
  constraint reservas_sin_cruce exclude using gist (
    profesional_id with =, tstzrange(inicio, fin) with &&
  ) where (estado not in ('cancelada', 'no_asistio'))
);
create index reservas_inicio_idx on public.reservas (inicio);
create index reservas_clienta_idx on public.reservas (clienta_id);

create table public.bloqueos (
  id uuid primary key default gen_random_uuid(),
  profesional_id text references public.profesionales (id) on delete cascade, -- vacío = todo el salón
  inicio timestamptz not null,
  fin timestamptz not null,
  motivo text not null default '',
  creada timestamptz not null default now(),
  check (fin > inicio)
);

create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  fecha date not null,
  profesional_id text references public.profesionales (id) on delete set null,
  servicio_id text references public.servicios (id) on delete set null,
  avisada boolean not null default false,
  creada timestamptz not null default now()
);

create table public.fichas (
  id uuid primary key default gen_random_uuid(),
  clienta_id uuid not null references public.clientas (id) on delete cascade,
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  servicio text not null default '',
  profesional_id text references public.profesionales (id) on delete set null,
  formula text not null default '',
  notas text not null default ''
);

-- ===== CAJA, GASTOS E INVENTARIO =====
create table public.caja_turnos (
  id uuid primary key default gen_random_uuid(),
  abierta timestamptz not null default now(),
  abierta_por uuid default auth.uid(),
  base_inicial int not null default 0,
  cerrada timestamptz,
  cerrada_por uuid,
  efectivo_contado int,
  notas text not null default ''
);

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  turno_id uuid references public.caja_turnos (id),
  reserva_id uuid references public.reservas (id) on delete set null,
  clienta_id uuid references public.clientas (id) on delete set null,
  profesional_id text references public.profesionales (id) on delete set null,
  items jsonb not null default '[]',
  subtotal int not null default 0,
  descuento int not null default 0,
  propina int not null default 0,
  total int not null default 0,
  metodo_pago text not null default 'efectivo',
  anulada boolean not null default false,
  usuario uuid default auth.uid()
);
create index ventas_fecha_idx on public.ventas (fecha);

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  categoria text not null default 'otros',
  valor int not null check (valor >= 0),
  metodo_pago text not null default 'efectivo',
  descripcion text not null default '',
  creada timestamptz not null default now()
);

create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null default '',
  contacto text not null default '',
  creada timestamptz not null default now()
);

create table public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id text not null references public.productos (id) on delete cascade,
  cantidad int not null,
  motivo text not null default 'ajuste',
  nota text not null default '',
  costo_unitario int,
  proveedor_id uuid references public.proveedores (id) on delete set null,
  fecha timestamptz not null default now(),
  usuario uuid default auth.uid()
);

-- ===== TIENDA, REGALOS, CUPONES, OPINIONES, GALERÍA =====
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  telefono text not null,
  items jsonb not null,
  total int not null,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'listo', 'entregado', 'cancelado')),
  entrega text not null default 'recoger' check (entrega in ('recoger', 'domicilio')),
  direccion text not null default '',
  notas text not null default '',
  pagado boolean not null default false,
  creada timestamptz not null default now()
);

create table public.tarjetas_regalo (
  codigo text primary key,
  valor_inicial int not null,
  saldo int not null check (saldo >= 0),
  de text not null,
  para text not null,
  telefono text not null,
  mensaje text not null default '',
  estado text not null default 'pendiente_pago' check (estado in ('pendiente_pago', 'activa', 'agotada', 'anulada')),
  vence date not null,
  creada timestamptz not null default now()
);

create table public.cupones (
  codigo text primary key check (codigo = upper(codigo)),
  descripcion text not null default '',
  tipo text not null default 'porcentaje' check (tipo in ('porcentaje', 'valor')),
  valor int not null check (valor > 0),
  minimo int not null default 0,
  desde date,
  hasta date,
  usos_max int,
  usos int not null default 0,
  activo boolean not null default true,
  creada timestamptz not null default now()
);

create table public.resenas (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid unique references public.reservas (id) on delete set null,
  nombre text not null,
  servicio text not null default '',
  profesional_id text references public.profesionales (id) on delete set null,
  estrellas int not null check (estrellas between 1 and 5),
  texto text not null default '',
  aprobada boolean not null default false,
  creada timestamptz not null default now()
);

create table public.galeria (
  id uuid primary key default gen_random_uuid(),
  foto text not null,
  foto_antes text,
  titulo text not null default '',
  categoria text not null default '',
  profesional_id text references public.profesionales (id) on delete set null,
  visible boolean not null default true,
  orden int not null default 0,
  creada timestamptz not null default now()
);

create table public.pagos (
  referencia text primary key,
  tipo text not null check (tipo in ('tarjeta', 'pedido')),
  codigo text not null,
  monto_centavos bigint not null,
  estado text not null default 'PENDING',
  transaccion_id text,
  creada timestamptz not null default now(),
  actualizada timestamptz
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  usuario uuid default auth.uid(),
  tabla text not null,
  accion text not null,
  registro_id text,
  detalle jsonb not null default '{}'
);

-- ===== QUIÉN ES QUIÉN =====
create function public.mi_rol() returns text
language sql stable security definer set search_path = '' as $$
  select rol from public.perfiles where user_id = auth.uid()
$$;
create function public.es_personal() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where user_id = auth.uid())
$$;
create function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where user_id = auth.uid() and rol in ('duena', 'recepcion'))
$$;
create function public.es_duena() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where user_id = auth.uid() and rol = 'duena')
$$;
create function public.mi_profesional() returns text
language sql stable security definer set search_path = '' as $$
  select profesional_id from public.perfiles where user_id = auth.uid()
$$;

-- ===== REGLAS DE ACCESO =====
do $$
declare t text;
begin
  foreach t in array array['categorias','servicios','disenos','profesionales','productos','festivos','config','perfiles',
    'solicitudes_acceso','clientas','reservas','bloqueos','lista_espera','fichas','caja_turnos','ventas','gastos',
    'proveedores','inventario_movimientos','pedidos','tarjetas_regalo','cupones','resenas','galeria','pagos','auditoria']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Catálogo: lectura pública, edición del salón
do $$
declare t text;
begin
  foreach t in array array['categorias','servicios','disenos','profesionales','productos','festivos'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "%s: leer" on public.%I for select using (true)', t, t);
    execute format('create policy "%s: editar" on public.%I for all to authenticated using (public.es_admin()) with check (public.es_admin())', t, t);
  end loop;
end $$;

grant select on public.config to anon, authenticated;
grant insert, update, delete on public.config to authenticated;
create policy "config: leer" on public.config for select using (publica or public.es_personal());
create policy "config: editar" on public.config for all to authenticated using (public.es_admin()) with check (public.es_admin());

grant select on public.perfiles to authenticated;
create policy "perfiles: equipo" on public.perfiles for select to authenticated using (user_id = auth.uid() or public.es_personal());

grant select, update on public.solicitudes_acceso to authenticated;
create policy "solicitudes: dueña" on public.solicitudes_acceso for all to authenticated using (public.es_duena()) with check (public.es_duena());

grant select, insert, update on public.clientas to authenticated;
create policy "clientas: equipo lee" on public.clientas for select to authenticated using (public.es_personal());
create policy "clientas: equipo edita" on public.clientas for update to authenticated using (public.es_personal()) with check (public.es_personal());
create policy "clientas: admin crea" on public.clientas for insert to authenticated with check (public.es_admin());

grant select, update on public.reservas to authenticated;
create policy "reservas: ver" on public.reservas for select to authenticated
  using (public.es_admin() or profesional_id = public.mi_profesional());
create policy "reservas: cambiar" on public.reservas for update to authenticated
  using (public.es_admin() or profesional_id = public.mi_profesional())
  with check (public.es_admin() or profesional_id = public.mi_profesional());

grant select, insert, delete on public.bloqueos to authenticated;
create policy "bloqueos: ver" on public.bloqueos for select to authenticated using (public.es_personal());
create policy "bloqueos: crear" on public.bloqueos for insert to authenticated
  with check (public.es_admin() or (profesional_id is not null and profesional_id = public.mi_profesional()));
create policy "bloqueos: quitar" on public.bloqueos for delete to authenticated
  using (public.es_admin() or (profesional_id is not null and profesional_id = public.mi_profesional()));

grant select, insert, update, delete on public.lista_espera, public.caja_turnos, public.ventas, public.gastos,
  public.proveedores, public.inventario_movimientos, public.pedidos, public.cupones to authenticated;
create policy "lista_espera: admin" on public.lista_espera for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "caja: admin" on public.caja_turnos for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "ventas: admin" on public.ventas for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "gastos: admin" on public.gastos for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "proveedores: admin" on public.proveedores for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "inventario: admin" on public.inventario_movimientos for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "pedidos: admin" on public.pedidos for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "cupones: admin" on public.cupones for all to authenticated using (public.es_admin()) with check (public.es_admin());

grant select, insert on public.fichas to authenticated;
create policy "fichas: ver" on public.fichas for select to authenticated using (public.es_personal());
create policy "fichas: crear" on public.fichas for insert to authenticated with check (public.es_personal());

grant select, update on public.tarjetas_regalo to authenticated;
create policy "tarjetas: admin" on public.tarjetas_regalo for all to authenticated using (public.es_admin()) with check (public.es_admin());

grant select on public.resenas to anon, authenticated;
grant update, delete on public.resenas to authenticated;
create policy "resenas: publicadas" on public.resenas for select using (aprobada or public.es_personal());
create policy "resenas: moderar" on public.resenas for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "resenas: borrar" on public.resenas for delete to authenticated using (public.es_admin());

grant select on public.galeria to anon, authenticated;
grant insert, update, delete on public.galeria to authenticated;
create policy "galeria: ver" on public.galeria for select using (visible or public.es_personal());
create policy "galeria: subir" on public.galeria for insert to authenticated with check (public.es_personal());
create policy "galeria: editar" on public.galeria for update to authenticated
  using (public.es_admin() or profesional_id = public.mi_profesional())
  with check (public.es_admin() or profesional_id = public.mi_profesional());
create policy "galeria: quitar" on public.galeria for delete to authenticated
  using (public.es_admin() or profesional_id = public.mi_profesional());

grant select on public.auditoria to authenticated;
create policy "auditoria: dueña" on public.auditoria for select to authenticated using (public.es_duena());
-- pagos: solo la función del servidor (service role) la usa

-- ===== FOTOS (almacenamiento) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('galeria', 'galeria', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "galeria: el equipo sube fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'galeria' and public.es_personal());
create policy "galeria: admin borra fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'galeria' and public.es_admin());

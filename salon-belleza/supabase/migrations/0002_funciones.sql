-- Neiva Belleza · 2/3 · Funciones (lo que la página y el panel le piden a la base) y automatismos
-- Todas validan del lado del servidor y responden con códigos de error que api.js traduce (HORARIO_OCUPADO, etc.).

-- ===== AYUDAS INTERNAS =====
create function public._codigo(n int) returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, n)
$$;

create function public._hoy() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- Deja solo los dígitos del celular (quita +57 si viene)
create function public._telefono(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(t) = 12 and left(t, 2) = '57' then t := substr(t, 3); end if;
  if length(t) < 7 or length(t) > 12 then raise exception 'TELEFONO_INVALIDO'; end if;
  return t;
end $$;

create function public._nombre(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if length(t) < 3 or length(t) > 80 then raise exception 'NOMBRE_INVALIDO'; end if;
  return t;
end $$;

-- Precio y duración de una combinación de servicios (igual que calcularServicios() en datos.js)
create function public._calcular_servicios(p_servicios text[], p_largo text,
  out items jsonb, out minutos int, out precio int, out categorias text[])
language plpgsql stable set search_path = '' as $$
declare
  sid text; s record; d record; p int; m int;
begin
  items := '[]'; minutos := 0; precio := 0; categorias := '{}';
  if p_servicios is null or cardinality(p_servicios) = 0 or cardinality(p_servicios) > 6 then
    raise exception 'SERVICIO_INVALIDO';
  end if;
  foreach sid in array p_servicios loop
    if sid like 'diseno:%' then
      select * into d from public.disenos where id = substr(sid, 8) and activo;
      if not found then raise exception 'SERVICIO_INVALIDO'; end if;
      p := d.precio; m := 60;
      items := items || jsonb_build_object('id', sid, 'nombre', 'Manicura ' || d.nombre, 'precio', p, 'minutos', m);
      if not 'unas' = any (categorias) then categorias := categorias || 'unas'; end if;
    else
      select * into s from public.servicios where id = sid and activo;
      if not found then raise exception 'SERVICIO_INVALIDO'; end if;
      p := s.precio; m := s.minutos;
      if p_largo is not null and s.ajustes_largo ? p_largo then
        p := p + coalesce((s.ajustes_largo -> p_largo ->> 'precio')::int, 0);
        m := m + coalesce((s.ajustes_largo -> p_largo ->> 'minutos')::int, 0);
      end if;
      m := m + s.limpieza_min;
      items := items || jsonb_build_object('id', s.id, 'nombre', s.nombre, 'precio', p, 'minutos', m);
      if not s.categoria_id = any (categorias) then categorias := categorias || s.categoria_id; end if;
    end if;
    minutos := minutos + m; precio := precio + p;
  end loop;
end $$;

-- Revisa que la profesional pueda atender en ese horario. Lanza el código de error si no.
create function public._validar_horario(p_pro text, p_inicio timestamptz, p_fin timestamptz,
  p_ignorar uuid, p_es_clienta boolean)
returns void language plpgsql stable set search_path = '' as $$
declare
  pro record;
  li timestamp := p_inicio at time zone 'America/Bogota';
  lf timestamp := p_fin at time zone 'America/Bogota';
begin
  select * into pro from public.profesionales where id = p_pro and activo;
  if not found then raise exception 'PROFESIONAL_NO_HACE_SERVICIO'; end if;
  if p_es_clienta then
    if p_inicio < now() + interval '30 minutes' then raise exception 'HORA_PASADA'; end if;
    if p_inicio > now() + interval '4 months' then raise exception 'MUY_LEJOS'; end if;
  end if;
  if extract(dow from li) = 0 and not (extract(dow from li)::int = any (pro.dias)) then raise exception 'DOMINGO'; end if;
  if exists (select 1 from public.festivos where fecha = li::date) then raise exception 'FESTIVO'; end if;
  if not (extract(dow from li)::int = any (pro.dias)) then raise exception 'NO_TRABAJA'; end if;
  if li::time < pro.hora_inicio or lf::date <> li::date or lf::time > pro.hora_fin then
    raise exception 'FUERA_DE_HORARIO';
  end if;
  if exists (select 1 from public.bloqueos b
             where (b.profesional_id = p_pro or b.profesional_id is null)
               and tstzrange(b.inicio, b.fin) && tstzrange(p_inicio, p_fin)) then
    raise exception 'BLOQUEADO';
  end if;
  if exists (select 1 from public.reservas r
             where r.profesional_id = p_pro and r.estado not in ('cancelada', 'no_asistio')
               and (p_ignorar is null or r.id <> p_ignorar)
               and tstzrange(r.inicio, r.fin) && tstzrange(p_inicio, p_fin)) then
    raise exception 'HORARIO_OCUPADO';
  end if;
end $$;

-- Busca o crea la clienta por su celular
create function public._clienta(p_nombre text, p_telefono text, p_email text, p_cumpleanos date,
  p_acepta_promos boolean, p_codigo_referido text)
returns public.clientas language plpgsql volatile set search_path = '' as $$
declare c public.clientas; ref uuid;
begin
  select * into c from public.clientas where telefono = p_telefono;
  if found then
    update public.clientas set
      email = coalesce(email, nullif(btrim(p_email), '')),
      cumpleanos = coalesce(cumpleanos, p_cumpleanos),
      acepta_promos = acepta_promos or coalesce(p_acepta_promos, false)
    where id = c.id returning * into c;
    return c;
  end if;
  if p_codigo_referido is not null then
    select id into ref from public.clientas where codigo_referido = upper(btrim(p_codigo_referido));
  end if;
  loop
    begin
      insert into public.clientas (nombre, telefono, email, cumpleanos, acepta_promos, codigo_referido, referida_por)
      values (p_nombre, p_telefono, nullif(btrim(p_email), ''), p_cumpleanos, coalesce(p_acepta_promos, false),
              public._codigo(6), ref)
      returning * into c;
      return c;
    exception when unique_violation then
      select * into c from public.clientas where telefono = p_telefono;
      if found then return c; end if;
    end;
  end loop;
end $$;

-- Inserta una cita con un código corto único
create function public._insertar_reserva(r public.reservas) returns public.reservas
language plpgsql volatile set search_path = '' as $$
declare nueva public.reservas;
begin
  loop
    r.codigo := public._codigo(6);
    begin
      insert into public.reservas select r.* returning * into nueva;
      return nueva;
    exception
      when unique_violation then
        if sqlerrm like '%codigo%' then continue; end if;
        raise;
      when exclusion_violation then
        raise exception 'HORARIO_OCUPADO';
    end;
  end loop;
end $$;

-- Lo que ve la clienta de su cita (sin datos de otras personas)
create function public._vista_reserva(r public.reservas) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'codigo', r.codigo, 'token', r.token, 'estado', r.estado, 'inicio', r.inicio, 'fin', r.fin,
    'servicios', r.servicios, 'productos', r.productos, 'subtotal', r.subtotal, 'descuento', r.descuento,
    'total', r.total, 'profesional_id', r.profesional_id,
    'profesional', (select nombre from public.profesionales where id = r.profesional_id),
    'nombre', (select split_part(nombre, ' ', 1) from public.clientas where id = r.clienta_id),
    'codigo_referido', (select codigo_referido from public.clientas where id = r.clienta_id),
    'puede_cambiar', r.estado in ('pendiente', 'confirmada') and r.inicio - now() > interval '24 hours',
    'resenada', exists (select 1 from public.resenas where reserva_id = r.id))
$$;

-- ===== PÁGINA PÚBLICA: RESERVAS =====
create function public.horarios_ocupados(p_desde date, p_hasta date)
returns table (profesional_id text, inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.profesional_id, r.inicio, r.fin from public.reservas r
  where r.estado not in ('cancelada', 'no_asistio')
    and r.fin >= (p_desde::timestamp at time zone 'America/Bogota')
    and r.inicio < ((p_hasta + 1)::timestamp at time zone 'America/Bogota')
  union all
  select b.profesional_id, b.inicio, b.fin from public.bloqueos b
  where b.fin >= (p_desde::timestamp at time zone 'America/Bogota')
    and b.inicio < ((p_hasta + 1)::timestamp at time zone 'America/Bogota')
$$;

create function public.crear_reserva(
  p_nombre text, p_telefono text, p_servicios text[], p_profesional text, p_inicio timestamptz,
  p_largo text default null, p_productos jsonb default '[]', p_notas text default '', p_email text default null,
  p_cumpleanos date default null, p_acepta_promos boolean default false, p_codigo_referido text default null,
  p_origen text default 'web')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  nombre text := public._nombre(p_nombre);
  tel text := public._telefono(p_telefono);
  calc record; prods jsonb := '[]'; item jsonb; prod record; total_prod int := 0;
  fin timestamptz; pro_id text; candidata record; cl public.clientas; r public.reservas;
begin
  select * into calc from public._calcular_servicios(p_servicios, p_largo);
  fin := p_inicio + make_interval(mins => calc.minutos);

  for item in select * from jsonb_array_elements(coalesce(p_productos, '[]')) loop
    select * into prod from public.productos where id = item ->> 'id' and activo;
    if not found then raise exception 'PRODUCTO_INVALIDO'; end if;
    prods := prods || jsonb_build_object('id', prod.id, 'nombre', prod.nombre, 'precio', prod.precio,
      'cantidad', greatest(1, least(10, coalesce((item ->> 'cantidad')::int, 1))));
  end loop;
  select coalesce(sum((x ->> 'precio')::int * (x ->> 'cantidad')::int), 0) into total_prod from jsonb_array_elements(prods) x;

  if p_profesional is null or p_profesional = 'cualquiera' then
    -- Sin preferencia: la primera profesional que hace todos los servicios y está libre
    for candidata in select id from public.profesionales
                     where activo and categorias @> calc.categorias order by orden loop
      begin
        perform public._validar_horario(candidata.id, p_inicio, fin, null, true);
        pro_id := candidata.id; exit;
      exception when others then
        if sqlerrm in ('HORA_PASADA', 'MUY_LEJOS', 'FESTIVO') then raise; end if;
      end;
    end loop;
    if pro_id is null then raise exception 'HORARIO_OCUPADO'; end if;
  else
    if not exists (select 1 from public.profesionales where id = p_profesional and activo and categorias @> calc.categorias) then
      raise exception 'PROFESIONAL_NO_HACE_SERVICIO';
    end if;
    perform public._validar_horario(p_profesional, p_inicio, fin, null, true);
    pro_id := p_profesional;
  end if;

  cl := public._clienta(nombre, tel, p_email, p_cumpleanos, p_acepta_promos, p_codigo_referido);
  if (select count(*) from public.reservas
      where clienta_id = cl.id and estado not in ('cancelada', 'no_asistio')
        and (inicio at time zone 'America/Bogota')::date = (p_inicio at time zone 'America/Bogota')::date) >= 3 then
    raise exception 'LIMITE_RESERVAS';
  end if;

  r.clienta_id := cl.id; r.profesional_id := pro_id; r.inicio := p_inicio; r.fin := fin;
  r.servicios := calc.items; r.productos := prods; r.largo := p_largo;
  r.subtotal := calc.precio + total_prod; r.descuento := 0; r.total := r.subtotal;
  r.estado := 'pendiente';
  r.origen := case when p_origen in ('web', 'instagram', 'google', 'whatsapp', 'referido') then p_origen else 'web' end;
  r.nota := left(coalesce(p_notas, ''), 500);
  r.id := gen_random_uuid(); r.token := gen_random_uuid(); r.creada := now(); r.actualizada := now();
  r.recordatorio_enviado := false;
  r := public._insertar_reserva(r);
  insert into public.auditoria (tabla, accion, registro_id, detalle)
  values ('reservas', 'crear', r.id::text, jsonb_build_object('origen', r.origen));
  return public._vista_reserva(r) || jsonb_build_object('nombre', nombre);
end $$;

create function public.ver_reserva(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.reservas;
begin
  select * into r from public.reservas where token::text = p_token;
  if not found then return null; end if;
  return public._vista_reserva(r);
end $$;

create function public.confirmar_asistencia(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.reservas;
begin
  select * into r from public.reservas where token::text = p_token for update;
  if not found then raise exception 'NO_EXISTE'; end if;
  if r.estado not in ('pendiente', 'confirmada') then raise exception 'NO_SE_PUEDE_CAMBIAR'; end if;
  update public.reservas set estado = 'confirmada' where id = r.id returning * into r;
  return public._vista_reserva(r);
end $$;

create function public.cancelar_reserva(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.reservas;
begin
  select * into r from public.reservas where token::text = p_token for update;
  if not found then raise exception 'NO_EXISTE'; end if;
  if r.estado not in ('pendiente', 'confirmada') then raise exception 'NO_SE_PUEDE_CAMBIAR'; end if;
  if r.inicio - now() < interval '24 hours' then raise exception 'MENOS_DE_24H'; end if;
  update public.reservas set estado = 'cancelada' where id = r.id returning * into r;
  insert into public.auditoria (tabla, accion, registro_id) values ('reservas', 'cancelar_clienta', r.id::text);
  return public._vista_reserva(r);
end $$;

create function public.reprogramar_reserva(p_token text, p_inicio timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.reservas; nuevo_fin timestamptz;
begin
  select * into r from public.reservas where token::text = p_token for update;
  if not found then raise exception 'NO_EXISTE'; end if;
  if r.estado not in ('pendiente', 'confirmada') then raise exception 'NO_SE_PUEDE_CAMBIAR'; end if;
  if r.inicio - now() < interval '24 hours' then raise exception 'MENOS_DE_24H'; end if;
  nuevo_fin := p_inicio + (r.fin - r.inicio);
  perform public._validar_horario(r.profesional_id, p_inicio, nuevo_fin, r.id, true);
  begin
    update public.reservas set inicio = p_inicio, fin = nuevo_fin, estado = 'pendiente',
      recordatorio_enviado = false where id = r.id returning * into r;
  exception when exclusion_violation then raise exception 'HORARIO_OCUPADO';
  end;
  insert into public.auditoria (tabla, accion, registro_id, detalle)
  values ('reservas', 'reprogramar_clienta', r.id::text, jsonb_build_object('antes', r.inicio, 'despues', p_inicio));
  return public._vista_reserva(r);
end $$;

create function public.unirse_lista_espera(p_nombre text, p_telefono text, p_fecha date,
  p_servicio text default null, p_profesional text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare tel text := public._telefono(p_telefono); nombre text := public._nombre(p_nombre);
begin
  if p_fecha is null or p_fecha < public._hoy() or p_fecha > public._hoy() + 120 then raise exception 'MUY_LEJOS'; end if;
  if (select count(*) from public.lista_espera where telefono = tel and fecha >= public._hoy()) >= 3 then
    raise exception 'LIMITE_RESERVAS';
  end if;
  insert into public.lista_espera (nombre, telefono, fecha, servicio_id, profesional_id)
  values (nombre, tel, p_fecha,
    (select id from public.servicios where id = p_servicio),
    (select id from public.profesionales where id = p_profesional));
  return jsonb_build_object('ok', true);
end $$;

-- ===== CUPONES =====
create function public._descuento_cupon(p_codigo text, p_subtotal int)
returns public.cupones language plpgsql stable set search_path = '' as $$
declare c public.cupones;
begin
  select * into c from public.cupones where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or not c.activo
     or (c.desde is not null and public._hoy() < c.desde)
     or (c.hasta is not null and public._hoy() > c.hasta)
     or (c.usos_max is not null and c.usos >= c.usos_max)
     or coalesce(p_subtotal, 0) < c.minimo then
    raise exception 'CUPON_INVALIDO';
  end if;
  return c;
end $$;

create function public._monto_descuento(c public.cupones, p_subtotal int) returns int
language sql immutable set search_path = '' as $$
  select case when c.tipo = 'porcentaje' then round(p_subtotal * least(c.valor, 100) / 100.0)::int
              else least(c.valor, p_subtotal) end
$$;

create function public.validar_cupon(p_codigo text, p_subtotal int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.cupones := public._descuento_cupon(p_codigo, p_subtotal);
begin
  return jsonb_build_object('codigo', c.codigo, 'descripcion', c.descripcion,
    'descuento', public._monto_descuento(c, p_subtotal));
end $$;

create function public.aplicar_cupon(p_token text, p_codigo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.reservas; c public.cupones; d int;
begin
  select * into r from public.reservas where token::text = p_token for update;
  if not found then raise exception 'NO_EXISTE'; end if;
  if r.cupon is not null or r.estado not in ('pendiente', 'confirmada') then raise exception 'CUPON_INVALIDO'; end if;
  select * into c from public.cupones where codigo = upper(btrim(coalesce(p_codigo, ''))) for update;
  c := public._descuento_cupon(p_codigo, r.subtotal);
  d := public._monto_descuento(c, r.subtotal);
  update public.cupones set usos = usos + 1 where codigo = c.codigo;
  update public.reservas set cupon = c.codigo, descuento = d, total = greatest(0, subtotal - d)
  where id = r.id returning * into r;
  return jsonb_build_object('cupon', c.codigo, 'descuento', d, 'total', r.total);
end $$;

-- ===== OPINIONES =====
create function public.dejar_resena(p_token text, p_estrellas int, p_texto text default '')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.reservas; cl public.clientas;
begin
  select * into r from public.reservas where token::text = p_token;
  if not found then raise exception 'NO_EXISTE'; end if;
  if r.estado <> 'terminada' then raise exception 'AUN_NO_TERMINADA'; end if;
  if p_estrellas is null or p_estrellas < 1 or p_estrellas > 5 then raise exception 'ESTRELLAS_INVALIDAS'; end if;
  if exists (select 1 from public.resenas where reserva_id = r.id) then raise exception 'YA_RESENADA'; end if;
  select * into cl from public.clientas where id = r.clienta_id;
  insert into public.resenas (reserva_id, nombre, servicio, profesional_id, estrellas, texto)
  values (r.id,
    split_part(cl.nombre, ' ', 1) || coalesce(' ' || nullif(left(split_part(cl.nombre, ' ', 2), 1), '') || '.', ''),
    coalesce(r.servicios -> 0 ->> 'nombre', ''), r.profesional_id, p_estrellas, left(btrim(coalesce(p_texto, '')), 600));
  return jsonb_build_object('ok', true);
end $$;

-- ===== TIENDA =====
create function public.crear_pedido(p_nombre text, p_telefono text, p_items jsonb, p_entrega text default 'recoger',
  p_direccion text default '', p_notas text default '')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_nombre text := public._nombre(p_nombre); v_tel text := public._telefono(p_telefono);
  item jsonb; prod record; cant int; v_items jsonb := '[]'; v_total int := 0; v_codigo text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'CARRITO_VACIO'; end if;
  if p_entrega not in ('recoger', 'domicilio') then raise exception 'DIRECCION_INVALIDA'; end if;
  if p_entrega = 'domicilio' and length(btrim(coalesce(p_direccion, ''))) < 8 then raise exception 'DIRECCION_INVALIDA'; end if;
  if (select count(*) from public.pedidos where telefono = v_tel and estado = 'nuevo') >= 3 then raise exception 'LIMITE_PEDIDOS'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    select * into prod from public.productos where id = item ->> 'id' and activo for update;
    if not found then raise exception 'PRODUCTO_INVALIDO'; end if;
    cant := coalesce((item ->> 'cantidad')::int, 1);
    if cant < 1 or cant > 20 then raise exception 'PRODUCTO_INVALIDO'; end if;
    if prod.stock < cant then raise exception 'SIN_STOCK'; end if;
    v_items := v_items || jsonb_build_object('id', prod.id, 'nombre', prod.nombre, 'precio', prod.precio, 'cantidad', cant);
    v_total := v_total + prod.precio * cant;
  end loop;
  loop
    v_codigo := public._codigo(6);
    exit when not exists (select 1 from public.pedidos p where p.codigo = v_codigo);
  end loop;
  insert into public.pedidos (codigo, nombre, telefono, items, total, entrega, direccion, notas)
  values (v_codigo, v_nombre, v_tel, v_items, v_total, p_entrega, left(btrim(coalesce(p_direccion, '')), 200), left(coalesce(p_notas, ''), 300));
  return jsonb_build_object('codigo', v_codigo, 'total', v_total, 'items', v_items, 'entrega', p_entrega);
end $$;

-- El pedido aparta las unidades; si se cancela, vuelven al inventario
create function public._pedido_inventario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare item jsonb; signo int;
begin
  if tg_op = 'INSERT' then signo := -1;
  elsif new.estado = 'cancelado' and old.estado <> 'cancelado' then signo := 1;
  elsif old.estado = 'cancelado' and new.estado <> 'cancelado' then signo := -1;
  else return new;
  end if;
  for item in select * from jsonb_array_elements(new.items) loop
    insert into public.inventario_movimientos (producto_id, cantidad, motivo, nota)
    values (item ->> 'id', signo * (item ->> 'cantidad')::int, 'pedido', 'Pedido ' || new.codigo);
  end loop;
  return new;
end $$;
create trigger pedido_inventario after insert or update of estado on public.pedidos
  for each row execute function public._pedido_inventario();

-- ===== TARJETAS DE REGALO =====
create function public.solicitar_tarjeta_regalo(p_valor int, p_de text, p_para text, p_telefono text, p_mensaje text default '')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare tel text := public._telefono(p_telefono); v_codigo text; t public.tarjetas_regalo;
begin
  if p_valor is null or p_valor < 20000 or p_valor > 2000000 then raise exception 'VALOR_INVALIDO'; end if;
  perform public._nombre(p_de); perform public._nombre(p_para);
  if not public.es_admin() and (select count(*) from public.tarjetas_regalo where telefono = tel and estado = 'pendiente_pago') >= 5 then
    raise exception 'LIMITE_PEDIDOS';
  end if;
  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.tarjetas_regalo x where x.codigo = v_codigo);
  end loop;
  insert into public.tarjetas_regalo (codigo, valor_inicial, saldo, de, para, telefono, mensaje, vence)
  values (v_codigo, p_valor, p_valor, btrim(p_de), btrim(p_para), tel, left(btrim(coalesce(p_mensaje, '')), 200), public._hoy() + 365)
  returning * into t;
  return jsonb_build_object('codigo', t.codigo, 'valor', t.valor_inicial, 'estado', t.estado, 'vence', t.vence);
end $$;

create function public.saldo_tarjeta(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tarjetas_regalo;
begin
  select * into t from public.tarjetas_regalo where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then raise exception 'NO_EXISTE'; end if;
  return jsonb_build_object('saldo', t.saldo, 'estado', t.estado, 'vence', t.vence, 'para', t.para);
end $$;

create function public.usar_tarjeta(p_codigo text, p_valor int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare t public.tarjetas_regalo;
begin
  if not public.es_admin() then raise exception 'SIN_PERMISO'; end if;
  select * into t from public.tarjetas_regalo where codigo = upper(btrim(coalesce(p_codigo, ''))) for update;
  if not found or t.estado <> 'activa' or t.vence < public._hoy() then raise exception 'TARJETA_NO_ACTIVA'; end if;
  if p_valor is null or p_valor < 0 or t.saldo < p_valor then raise exception 'SALDO_INSUFICIENTE'; end if;
  update public.tarjetas_regalo set saldo = saldo - p_valor,
    estado = case when saldo - p_valor = 0 then 'agotada' else estado end
  where codigo = t.codigo returning * into t;
  insert into public.auditoria (tabla, accion, registro_id, detalle)
  values ('tarjetas_regalo', 'usar', t.codigo, jsonb_build_object('valor', p_valor, 'saldo', t.saldo));
  return jsonb_build_object('saldo', t.saldo);
end $$;

-- ===== PANEL DEL SALÓN =====
create function public.crear_cita_salon(p_nombre text, p_telefono text, p_servicios text[], p_profesional text,
  p_inicio timestamptz, p_largo text default null, p_notas text default '', p_estado text default 'confirmada')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare calc record; cl public.clientas; r public.reservas; fin timestamptz;
begin
  if not (public.es_admin() or (public.es_personal() and p_profesional = public.mi_profesional())) then
    raise exception 'SIN_PERMISO';
  end if;
  if p_estado not in ('pendiente', 'confirmada', 'en_curso', 'terminada') then raise exception 'ESTADO_INVALIDO'; end if;
  select * into calc from public._calcular_servicios(p_servicios, p_largo);
  fin := p_inicio + make_interval(mins => calc.minutos);
  perform public._validar_horario(p_profesional, p_inicio, fin, null, false);
  cl := public._clienta(public._nombre(p_nombre), public._telefono(p_telefono), null, null, false, null);
  r.id := gen_random_uuid(); r.token := gen_random_uuid(); r.creada := now(); r.actualizada := now();
  r.clienta_id := cl.id; r.profesional_id := p_profesional; r.inicio := p_inicio; r.fin := fin;
  r.servicios := calc.items; r.productos := '[]'; r.largo := p_largo;
  r.subtotal := calc.precio; r.descuento := 0; r.total := calc.precio;
  r.estado := p_estado; r.origen := 'salon'; r.nota := left(coalesce(p_notas, ''), 500); r.recordatorio_enviado := false;
  r := public._insertar_reserva(r);
  insert into public.auditoria (tabla, accion, registro_id, detalle)
  values ('reservas', 'crear', r.id::text, jsonb_build_object('origen', 'salon'));
  return to_jsonb(r);
end $$;

create function public.mover_cita(p_id uuid, p_inicio timestamptz, p_profesional text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.reservas; pro text; nuevo_fin timestamptz;
begin
  select * into r from public.reservas where id = p_id for update;
  if not found then raise exception 'NO_EXISTE'; end if;
  pro := coalesce(nullif(p_profesional, ''), r.profesional_id);
  if not (public.es_admin() or (r.profesional_id = public.mi_profesional() and pro = r.profesional_id)) then
    raise exception 'SIN_PERMISO';
  end if;
  if r.estado in ('cancelada', 'no_asistio', 'terminada') then raise exception 'NO_SE_PUEDE_CAMBIAR'; end if;
  nuevo_fin := p_inicio + (r.fin - r.inicio);
  perform public._validar_horario(pro, p_inicio, nuevo_fin, r.id, false);
  begin
    update public.reservas set inicio = p_inicio, fin = nuevo_fin, profesional_id = pro, recordatorio_enviado = false
    where id = r.id returning * into r;
  exception when exclusion_violation then raise exception 'HORARIO_OCUPADO';
  end;
  return to_jsonb(r);
end $$;

create function public.aprobar_acceso(p_user uuid, p_rol text, p_profesional text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s public.solicitudes_acceso;
begin
  if not public.es_duena() then raise exception 'SIN_PERMISO'; end if;
  if p_rol not in ('duena', 'recepcion', 'estilista') then raise exception 'ESTADO_INVALIDO'; end if;
  select * into s from public.solicitudes_acceso where user_id = p_user;
  if not found then raise exception 'NO_EXISTE'; end if;
  insert into public.perfiles (user_id, nombre, rol, profesional_id)
  values (p_user, s.nombre, p_rol, (select id from public.profesionales where id = p_profesional))
  on conflict (user_id) do update set rol = excluded.rol, profesional_id = excluded.profesional_id;
  update public.solicitudes_acceso set aprobada = true where user_id = p_user;
  insert into public.auditoria (tabla, accion, registro_id, detalle)
  values ('perfiles', 'aprobar', p_user::text, jsonb_build_object('rol', p_rol));
end $$;

create function public.comisiones(p_desde date, p_hasta date)
returns table (id text, nombre text, comision_servicio numeric, comision_producto numeric,
  servicios bigint, productos bigint, propinas bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.es_personal() then raise exception 'SIN_PERMISO'; end if;
  return query
  with v as (
    select * from public.ventas
    where not anulada
      and (fecha at time zone 'America/Bogota')::date between p_desde and p_hasta
  ), lineas as (
    select v.profesional_id as venta_pro, x
    from v cross join lateral jsonb_array_elements(v.items) x
  )
  select p.id, p.nombre, p.comision_servicio, p.comision_producto,
    coalesce((select sum((l.x ->> 'precio')::bigint * coalesce((l.x ->> 'cantidad')::int, 1)) from lineas l
              where coalesce(l.x ->> 'profesional_id', l.venta_pro) = p.id and coalesce(l.x ->> 'tipo', 'servicio') = 'servicio'), 0)::bigint,
    coalesce((select sum((l.x ->> 'precio')::bigint * coalesce((l.x ->> 'cantidad')::int, 1)) from lineas l
              where coalesce(l.x ->> 'profesional_id', l.venta_pro) = p.id and l.x ->> 'tipo' = 'producto'), 0)::bigint,
    coalesce((select sum(v.propina) from v where v.profesional_id = p.id), 0)::bigint
  from public.profesionales p
  where public.es_admin() or p.id = public.mi_profesional()
  order by p.orden;
end $$;

create function public.reporte(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not public.es_admin() then raise exception 'SIN_PERMISO'; end if;
  with v as (
    select * from public.ventas where not anulada and (fecha at time zone 'America/Bogota')::date between p_desde and p_hasta
  ), c as (
    select * from public.reservas where (inicio at time zone 'America/Bogota')::date between p_desde and p_hasta
  ), g as (
    select * from public.gastos where fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'ingresos_total', (select coalesce(sum(total), 0) from v),
    'ticket_promedio', (select coalesce(round(avg(total)), 0) from v),
    'gastos_total', (select coalesce(sum(valor), 0) from g),
    'citas_total', (select count(*) from c),
    'citas_terminadas', (select count(*) from c where estado = 'terminada'),
    'canceladas', (select count(*) from c where estado = 'cancelada'),
    'no_asistio', (select count(*) from c where estado = 'no_asistio'),
    'clientas_nuevas', (select count(*) from public.clientas where (creada at time zone 'America/Bogota')::date between p_desde and p_hasta),
    'clientas_recurrentes', (select count(distinct c.clienta_id) from c
       where c.estado = 'terminada' and exists (select 1 from public.reservas r2 where r2.clienta_id = c.clienta_id
         and r2.estado = 'terminada' and r2.inicio < (p_desde::timestamp at time zone 'America/Bogota'))),
    'ingresos_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', total) order by dia), '[]') from
       (select (fecha at time zone 'America/Bogota')::date as dia, sum(total) as total from v group by 1) d),
    'por_profesional', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre,
         'ventas', (select coalesce(sum(total), 0) from v where v.profesional_id = p.id),
         'citas', (select count(*) from c where c.profesional_id = p.id and c.estado = 'terminada'),
         'minutos_reservados', (select coalesce(sum(extract(epoch from (c.fin - c.inicio)) / 60), 0)::int from c
            where c.profesional_id = p.id and c.estado not in ('cancelada', 'no_asistio'))) order by p.orden), '[]')
       from public.profesionales p),
    'servicios_top', (select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'veces', veces, 'valor', valor) order by veces desc), '[]') from
       (select s ->> 'nombre' as nombre, count(*) as veces, sum((s ->> 'precio')::int) as valor
        from c cross join lateral jsonb_array_elements(c.servicios) s
        where c.estado not in ('cancelada', 'no_asistio') group by 1 order by 2 desc limit 10) t),
    'por_metodo', (select coalesce(jsonb_object_agg(metodo_pago, total), '{}') from
       (select metodo_pago, sum(total) as total from v group by 1) m),
    'origen', (select coalesce(jsonb_object_agg(origen, n), '{}') from (select origen, count(*) as n from c group by 1) o),
    'gastos_categoria', (select coalesce(jsonb_object_agg(categoria, total), '{}') from
       (select categoria, sum(valor) as total from g group by 1) gc),
    'horas_pico', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'hora', hora, 'n', n)), '[]') from
       (select extract(dow from inicio at time zone 'America/Bogota')::int as dia,
               extract(hour from inicio at time zone 'America/Bogota')::int as hora, count(*) as n
        from c where c.estado not in ('cancelada') group by 1, 2) h)
  ) into res;
  return res;
end $$;

-- ===== AUTOMATISMOS =====
-- Cuentas nuevas: la dueña (correo fijo, ya confirmado) entra directo; las demás quedan esperando aprobación
create function public._cuenta_nueva() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nombre text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));
begin
  if lower(new.email) = 'anfebolivar@gmail.com' then
    if new.email_confirmed_at is not null then
      insert into public.perfiles (user_id, nombre, rol) values (new.id, nombre, 'duena') on conflict (user_id) do nothing;
      delete from public.solicitudes_acceso where user_id = new.id;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    insert into public.solicitudes_acceso (user_id, email, nombre) values (new.id, new.email, nombre) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger cuenta_nueva after insert or update of email_confirmed_at on auth.users
  for each row execute function public._cuenta_nueva();

-- Cambios de estado hechos desde el panel quedan en el historial; cita terminada = sello (+ puntos a quien la refirió)
create function public._reserva_cambio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.actualizada := now();
  return new;
end $$;
create trigger reserva_actualizada before update on public.reservas
  for each row execute function public._reserva_cambio();

create function public._reserva_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cl public.clientas;
begin
  if new.estado is distinct from old.estado then
    if auth.uid() is not null and public.es_personal() then
      insert into public.auditoria (tabla, accion, registro_id, detalle)
      values ('reservas', 'cambio_panel', new.id::text, jsonb_build_object('estado', jsonb_build_array(old.estado, new.estado)));
    end if;
    if new.estado = 'terminada' and old.estado <> 'terminada' then
      update public.clientas set sellos = sellos + 1 where id = new.clienta_id returning * into cl;
      -- Primera cita terminada de una clienta referida: 200 puntos para la amiga que la recomendó
      if cl.referida_por is not null and not exists (
        select 1 from public.reservas where clienta_id = new.clienta_id and estado = 'terminada' and id <> new.id) then
        update public.clientas set puntos = puntos + 200 where id = cl.referida_por;
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger reserva_estado after update of estado on public.reservas
  for each row execute function public._reserva_estado();

-- El inventario mueve el stock; las ventas de productos lo descuentan y suman puntos (1 por cada $1.000)
create function public._mover_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.productos set stock = stock + new.cantidad where id = new.producto_id;
  return null;
end $$;
create trigger mover_stock after insert on public.inventario_movimientos
  for each row execute function public._mover_stock();

create function public._venta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare item jsonb; signo int;
begin
  if tg_op = 'INSERT' then
    if new.anulada then return null; end if;
    signo := -1;
  elsif new.anulada and not old.anulada then signo := 1;
  else return null;
  end if;
  for item in select * from jsonb_array_elements(new.items) loop
    if item ->> 'tipo' = 'producto' and exists (select 1 from public.productos where id = item ->> 'id') then
      insert into public.inventario_movimientos (producto_id, cantidad, motivo, nota)
      values (item ->> 'id', signo * coalesce((item ->> 'cantidad')::int, 1),
              case when signo < 0 then 'venta' else 'anulacion' end, 'Caja');
    end if;
  end loop;
  if new.clienta_id is not null then
    update public.clientas set puntos = greatest(0, puntos - signo * (new.total / 1000)) where id = new.clienta_id;
  end if;
  insert into public.auditoria (tabla, accion, registro_id, detalle)
  values ('ventas', case when signo < 0 then 'venta' else 'anular' end, new.id::text,
          jsonb_build_object('total', new.total, 'metodo', new.metodo_pago));
  return null;
end $$;
create trigger venta after insert or update of anulada on public.ventas
  for each row execute function public._venta();

-- ===== PERMISOS DE LAS FUNCIONES =====
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.mi_rol(), public.es_personal(), public.es_admin(), public.es_duena(), public.mi_profesional()
  to anon, authenticated;
grant execute on function
  public.horarios_ocupados(date, date),
  public.crear_reserva(text, text, text[], text, timestamptz, text, jsonb, text, text, date, boolean, text, text),
  public.ver_reserva(text), public.confirmar_asistencia(text), public.cancelar_reserva(text),
  public.reprogramar_reserva(text, timestamptz),
  public.unirse_lista_espera(text, text, date, text, text),
  public.validar_cupon(text, int), public.aplicar_cupon(text, text),
  public.dejar_resena(text, int, text),
  public.crear_pedido(text, text, jsonb, text, text, text),
  public.solicitar_tarjeta_regalo(int, text, text, text, text),
  public.saldo_tarjeta(text)
  to anon, authenticated;
grant execute on function
  public.usar_tarjeta(text, int),
  public.crear_cita_salon(text, text, text[], text, timestamptz, text, text, text),
  public.mover_cita(uuid, timestamptz, text),
  public.aprobar_acceso(uuid, text, text),
  public.comisiones(date, date), public.reporte(date, date)
  to authenticated;

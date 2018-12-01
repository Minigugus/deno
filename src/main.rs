// Copyright 2018 the Deno authors. All rights reserved. MIT license.
extern crate dirs;
extern crate flatbuffers;
extern crate getopts;
extern crate http;
extern crate hyper;
extern crate hyper_rustls;
extern crate libc;
extern crate rand;
extern crate remove_dir_all;
extern crate ring;
extern crate rustyline;
extern crate tempfile;
extern crate tokio;
extern crate tokio_executor;
extern crate tokio_fs;
extern crate tokio_io;
extern crate tokio_process;
extern crate tokio_threadpool;
extern crate url;

#[macro_use]
extern crate lazy_static;
#[macro_use]
extern crate log;
#[macro_use]
extern crate futures;

pub mod code_provider;
pub mod errors;
pub mod flags;
mod fs;
mod http_body;
mod http_util;
pub mod isolate;
pub mod libdeno;
pub mod msg;
pub mod msg_util;
pub mod ops;
pub mod permissions;
mod repl;
pub mod resources;
pub mod snapshot;
mod tokio_util;
mod tokio_write;
pub mod version;

#[cfg(unix)]
mod eager_unix;

use std::env;
use std::sync::Arc;

static LOGGER: Logger = Logger;

struct Logger;

impl log::Log for Logger {
  fn enabled(&self, metadata: &log::Metadata) -> bool {
    metadata.level() <= log::max_level()
  }

  fn log(&self, record: &log::Record) {
    if self.enabled(record.metadata()) {
      println!("{} RS - {}", record.level(), record.args());
    }
  }
  fn flush(&self) {}
}

fn main() {
  // Rust does not die on panic by default. And -Cpanic=abort is broken.
  // https://github.com/rust-lang/cargo/issues/2738
  // Therefore this hack.
  std::panic::set_hook(Box::new(|panic_info| {
    eprintln!("{}", panic_info.to_string());
    std::process::abort();
  }));

  log::set_logger(&LOGGER).unwrap();
  let args = env::args().collect();
  let (flags, rest_argv, usage_string) =
    flags::set_flags(args).unwrap_or_else(|err| {
      eprintln!("{}", err);
      std::process::exit(1)
    });

  if flags.help {
    println!("{}", &usage_string);
    std::process::exit(0);
  }

  log::set_max_level(if flags.log_debug {
    log::LevelFilter::Debug
  } else {
    log::LevelFilter::Info
  });

  let cp = code_provider::CodeProvider::new(flags.reload, custom_root).unwrap();

  let compiler_state = Arc::new(isolate::IsolateState::new(flags, rest_argv));
  let compiler_snapshot = unsafe { snapshot::deno_snapshot.clone() };
  let mut compiler_isolate =
    isolate::Isolate::new(snapshot, state, ops::dispatch, &cp);
  tokio_util::init(|| {
    compiler_isolate
      .execute("compiler_main.js", "compilerMain();")
      .unwrap_or_else(|err| {
        error!("{}", err);
        std::process::exit(1);
      });
    compiler_isolate.event_loop();
  });

  let state = Arc::new(isolate::IsolateState::new(flags, rest_argv));
  let snapshot = unsafe { snapshot::deno_snapshot.clone() };
  let mut isolate = isolate::Isolate::new(snapshot, state, ops::dispatch, &cp);
  tokio_util::init(|| {
    deno_isolate
      .execute("deno_main.js", "denoMain();")
      .unwrap_or_else(|err| {
        error!("{}", err);
        std::process::exit(1);
      });
    deno_isolate.event_loop();
  });
}

// Copyright 2018-2019 the Deno authors. All rights reserved. MIT license.
use crate::diagnostics;
use crate::fmt_errors::JSErrorColor;
use crate::import_map;
pub use crate::msg::ErrorKind;
use crate::resolve_addr::ResolveAddrError;
use crate::source_maps::apply_source_map;
use crate::source_maps::SourceMapGetter;
use deno::JSError;
use hyper;
#[cfg(unix)]
use nix::{errno::Errno, Error as UnixError};
use std;
use std::fmt;
use std::io;
use std::str;
use url;

pub type DenoResult<T> = std::result::Result<T, DenoError>;

#[derive(Debug)]
pub struct DenoError {
  repr: Repr,
}

#[derive(Debug)]
enum Repr {
  Simple(ErrorKind, String),
  IoErr(io::Error),
  UrlErr(url::ParseError),
  HyperErr(hyper::Error),
  ImportMapErr(import_map::ImportMapError),
  Diagnostic(diagnostics::Diagnostic),
  JSError(JSError),
}

/// Create a new simple DenoError.
pub fn new(kind: ErrorKind, msg: String) -> DenoError {
  DenoError {
    repr: Repr::Simple(kind, msg),
  }
}

impl DenoError {
  pub fn kind(&self) -> ErrorKind {
    match self.repr {
      Repr::Simple(kind, ref _msg) => kind,
      // Repr::Simple(kind) => kind,
      Repr::IoErr(ref err) => {
        use std::io::ErrorKind::*;
        match err.kind() {
          NotFound => ErrorKind::NotFound,
          PermissionDenied => ErrorKind::PermissionDenied,
          ConnectionRefused => ErrorKind::ConnectionRefused,
          ConnectionReset => ErrorKind::ConnectionReset,
          ConnectionAborted => ErrorKind::ConnectionAborted,
          NotConnected => ErrorKind::NotConnected,
          AddrInUse => ErrorKind::AddrInUse,
          AddrNotAvailable => ErrorKind::AddrNotAvailable,
          BrokenPipe => ErrorKind::BrokenPipe,
          AlreadyExists => ErrorKind::AlreadyExists,
          WouldBlock => ErrorKind::WouldBlock,
          InvalidInput => ErrorKind::InvalidInput,
          InvalidData => ErrorKind::InvalidData,
          TimedOut => ErrorKind::TimedOut,
          Interrupted => ErrorKind::Interrupted,
          WriteZero => ErrorKind::WriteZero,
          Other => ErrorKind::Other,
          UnexpectedEof => ErrorKind::UnexpectedEof,
          _ => unreachable!(),
        }
      }
      Repr::UrlErr(ref err) => {
        use url::ParseError::*;
        match err {
          EmptyHost => ErrorKind::EmptyHost,
          IdnaError => ErrorKind::IdnaError,
          InvalidPort => ErrorKind::InvalidPort,
          InvalidIpv4Address => ErrorKind::InvalidIpv4Address,
          InvalidIpv6Address => ErrorKind::InvalidIpv6Address,
          InvalidDomainCharacter => ErrorKind::InvalidDomainCharacter,
          RelativeUrlWithoutBase => ErrorKind::RelativeUrlWithoutBase,
          RelativeUrlWithCannotBeABaseBase => {
            ErrorKind::RelativeUrlWithCannotBeABaseBase
          }
          SetHostOnCannotBeABaseUrl => ErrorKind::SetHostOnCannotBeABaseUrl,
          Overflow => ErrorKind::Overflow,
        }
      }
      Repr::HyperErr(ref err) => {
        // For some reason hyper::errors::Kind is private.
        if err.is_parse() {
          ErrorKind::HttpParse
        } else if err.is_user() {
          ErrorKind::HttpUser
        } else if err.is_canceled() {
          ErrorKind::HttpCanceled
        } else if err.is_closed() {
          ErrorKind::HttpClosed
        } else {
          ErrorKind::HttpOther
        }
      }
      Repr::ImportMapErr(ref _err) => ErrorKind::ImportMapError,
      Repr::Diagnostic(ref _err) => ErrorKind::Diagnostic,
      Repr::JSError(ref _err) => ErrorKind::JSError,
    }
  }

  pub fn apply_source_map<G: SourceMapGetter>(self, getter: &G) -> Self {
    if let Repr::JSError(js_error) = self.repr {
      return DenoError {
        repr: Repr::JSError(apply_source_map(&js_error, getter)),
      };
    }
    self
  }
}

impl fmt::Display for DenoError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self.repr {
      Repr::Simple(_kind, ref err_str) => f.pad(err_str),
      Repr::IoErr(ref err) => err.fmt(f),
      Repr::UrlErr(ref err) => err.fmt(f),
      Repr::HyperErr(ref err) => err.fmt(f),
      Repr::ImportMapErr(ref err) => f.pad(&err.msg),
      Repr::Diagnostic(ref err) => err.fmt(f),
      Repr::JSError(ref err) => JSErrorColor(err).fmt(f),
    }
  }
}

impl std::error::Error for DenoError {
  fn description(&self) -> &str {
    match self.repr {
      Repr::Simple(_kind, ref msg) => msg.as_str(),
      Repr::IoErr(ref err) => err.description(),
      Repr::UrlErr(ref err) => err.description(),
      Repr::HyperErr(ref err) => err.description(),
      Repr::ImportMapErr(ref err) => &err.msg,
      Repr::Diagnostic(ref err) => &err.items[0].message,
      Repr::JSError(ref err) => &err.message,
    }
  }

  fn cause(&self) -> Option<&dyn std::error::Error> {
    match self.repr {
      Repr::Simple(_kind, ref _msg) => None,
      Repr::IoErr(ref err) => Some(err),
      Repr::UrlErr(ref err) => Some(err),
      Repr::HyperErr(ref err) => Some(err),
      Repr::ImportMapErr(ref _err) => None,
      Repr::Diagnostic(ref _err) => None,
      Repr::JSError(ref _err) => None,
    }
  }
}

impl From<io::Error> for DenoError {
  #[inline]
  fn from(err: io::Error) -> Self {
    Self {
      repr: Repr::IoErr(err),
    }
  }
}

impl From<url::ParseError> for DenoError {
  #[inline]
  fn from(err: url::ParseError) -> Self {
    Self {
      repr: Repr::UrlErr(err),
    }
  }
}

impl From<hyper::Error> for DenoError {
  #[inline]
  fn from(err: hyper::Error) -> Self {
    Self {
      repr: Repr::HyperErr(err),
    }
  }
}

impl From<ResolveAddrError> for DenoError {
  fn from(e: ResolveAddrError) -> Self {
    match e {
      ResolveAddrError::Syntax => Self {
        repr: Repr::Simple(
          ErrorKind::InvalidInput,
          "invalid address syntax".to_string(),
        ),
      },
      ResolveAddrError::Resolution(io_err) => Self {
        repr: Repr::IoErr(io_err),
      },
    }
  }
}

#[cfg(unix)]
impl From<UnixError> for DenoError {
  fn from(e: UnixError) -> Self {
    match e {
      UnixError::Sys(Errno::EPERM) => Self {
        repr: Repr::Simple(
          ErrorKind::PermissionDenied,
          Errno::EPERM.desc().to_owned(),
        ),
      },
      UnixError::Sys(Errno::EINVAL) => Self {
        repr: Repr::Simple(
          ErrorKind::InvalidInput,
          Errno::EINVAL.desc().to_owned(),
        ),
      },
      UnixError::Sys(Errno::ENOENT) => Self {
        repr: Repr::Simple(
          ErrorKind::NotFound,
          Errno::ENOENT.desc().to_owned(),
        ),
      },
      UnixError::Sys(err) => Self {
        repr: Repr::Simple(ErrorKind::UnixError, err.desc().to_owned()),
      },
      _ => Self {
        repr: Repr::Simple(ErrorKind::Other, format!("{}", e)),
      },
    }
  }
}

impl From<import_map::ImportMapError> for DenoError {
  fn from(err: import_map::ImportMapError) -> Self {
    Self {
      repr: Repr::ImportMapErr(err),
    }
  }
}

impl From<diagnostics::Diagnostic> for DenoError {
  fn from(diagnostic: diagnostics::Diagnostic) -> Self {
    Self {
      repr: Repr::Diagnostic(diagnostic),
    }
  }
}

impl From<JSError> for DenoError {
  fn from(err: JSError) -> Self {
    Self {
      repr: Repr::JSError(err),
    }
  }
}

pub fn bad_resource() -> DenoError {
  new(ErrorKind::BadResource, String::from("bad resource id"))
}

pub fn permission_denied() -> DenoError {
  new(
    ErrorKind::PermissionDenied,
    String::from("permission denied"),
  )
}

pub fn op_not_implemented() -> DenoError {
  new(
    ErrorKind::OpNotAvailable,
    String::from("op not implemented"),
  )
}

pub fn worker_init_failed() -> DenoError {
  // TODO(afinch7) pass worker error data through here
  new(
    ErrorKind::WorkerInitFailed,
    String::from("worker init failed"),
  )
}

pub fn no_buffer_specified() -> DenoError {
  new(ErrorKind::InvalidInput, String::from("no buffer specified"))
}

pub fn no_async_support() -> DenoError {
  new(
    ErrorKind::NoAsyncSupport,
    String::from("op doesn't support async calls"),
  )
}

pub fn no_sync_support() -> DenoError {
  new(
    ErrorKind::NoSyncSupport,
    String::from("op doesn't support sync calls"),
  )
}

pub fn err_check(r: Result<(), DenoError>) {
  if let Err(e) = r {
    panic!(e.to_string());
  }
}

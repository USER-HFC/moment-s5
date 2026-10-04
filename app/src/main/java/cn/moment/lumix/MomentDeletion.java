package cn.moment.lumix;

import java.io.File;
import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;

/** Bounded deletion for one app-private moment directory. */
final class MomentDeletion {
    private MomentDeletion() {}

    static void delete(File root, String id) throws IOException {
        if (root == null || !isSimpleId(id)) {
            throw new IOException("非法动态照片路径");
        }

        Path rawRoot = root.toPath().toAbsolutePath().normalize();
        if (Files.isSymbolicLink(rawRoot)) throw new IOException("动态照片目录无效");
        File canonicalRoot = root.getCanonicalFile();
        Path rootPath = canonicalRoot.toPath();
        if (Files.isSymbolicLink(rootPath) || !Files.isDirectory(rootPath, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("动态照片目录无效");
        }

        Path candidate = rootPath.resolve(id).normalize();
        if (!rootPath.equals(candidate.getParent()) || Files.isSymbolicLink(candidate)
                || !Files.isDirectory(candidate, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("动态照片不存在");
        }

        File canonicalCandidate = candidate.toFile().getCanonicalFile();
        if (!canonicalRoot.equals(canonicalCandidate.getParentFile())) {
            throw new IOException("非法动态照片路径");
        }

        // Preflight the complete tree. A symlink is rejected before any file is removed.
        Files.walkFileTree(candidate, new SimpleFileVisitor<>() {
            @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                ensureInside(canonicalRoot, dir);
                rejectSymlink(dir);
                return FileVisitResult.CONTINUE;
            }

            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                ensureInside(canonicalRoot, file);
                rejectSymlink(file);
                return FileVisitResult.CONTINUE;
            }
        });

        Path metadata = candidate.resolve("moment.json");
        if (!Files.isRegularFile(metadata, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("动态照片不存在");
        }

        Files.walkFileTree(candidate, new SimpleFileVisitor<>() {
            @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                ensureInside(canonicalRoot, dir);
                rejectSymlink(dir);
                return FileVisitResult.CONTINUE;
            }

            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                ensureInside(canonicalRoot, file);
                rejectSymlink(file);
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override public FileVisitResult postVisitDirectory(Path dir, IOException error) throws IOException {
                if (error != null) throw error;
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static void rejectSymlink(Path path) throws IOException {
        if (Files.isSymbolicLink(path)) throw new IOException("动态照片目录包含符号链接");
    }

    private static boolean isSimpleId(String id) {
        return id != null && !id.isEmpty() && !".".equals(id) && !"..".equals(id)
                && id.indexOf('/') < 0 && id.indexOf('\\') < 0 && id.indexOf('\0') < 0
                && id.equals(new File(id).getName());
    }

    private static void ensureInside(File root, Path path) throws IOException {
        File canonical = path.toFile().getCanonicalFile();
        if (!canonical.getPath().startsWith(root.getPath() + File.separator)) {
            throw new IOException("非法动态照片路径");
        }
    }
}

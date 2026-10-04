package cn.moment.lumix;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Focused JVM checks for app-private moment deletion. */
public final class MomentDeletionChecks {
    private static int checks;

    private static void check(boolean value, String message) {
        checks++;
        if (!value) throw new AssertionError(message);
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("moment-delete-");
        Path outside = Files.createTempFile("moment-delete-outside-", ".txt");
        String id = "M1234567890_abcdef12";
        try {
            Path dir = Files.createDirectories(root.resolve(id).resolve("generated"));
            Files.writeString(root.resolve(id).resolve("moment.json"), "{}");
            Files.writeString(dir.resolve("rendered.jpg"), "jpeg");
            Files.writeString(dir.resolve("motion.mp4"), "video");
            MomentDeletion.delete(root.toFile(), "../" + outside.getFileName());
            throw new AssertionError("traversal accepted");
        } catch (IOException expected) {
            checks++;
        }
        check(Files.exists(outside), "outside file preserved after traversal rejection");

        MomentDeletion.delete(root.toFile(), id);
        check(!Files.exists(root.resolve(id)), "moment directory removed");
        check(Files.exists(outside), "outside file preserved");

        String symlinkId = "M1234567891_abcdef12";
        Path symlinkDir = Files.createDirectories(root.resolve(symlinkId));
        Files.writeString(symlinkDir.resolve("moment.json"), "{}");
        boolean symlinkChecked = false;
        try {
            Files.createSymbolicLink(symlinkDir.resolve("outside"), outside);
            symlinkChecked = true;
            try {
                MomentDeletion.delete(root.toFile(), symlinkId);
                throw new AssertionError("symlink accepted");
            } catch (IOException expected) {
                checks++;
            }
            check(Files.exists(outside), "outside file preserved after symlink rejection");
        } catch (UnsupportedOperationException | SecurityException | IOException ignored) {
            // The deletion helper remains covered by the traversal and bounded-tree checks.
        } finally {
            if (symlinkChecked) Files.deleteIfExists(symlinkDir.resolve("outside"));
            Files.deleteIfExists(symlinkDir.resolve("moment.json"));
            Files.deleteIfExists(symlinkDir);
        }
        Files.deleteIfExists(outside);
        Files.deleteIfExists(root);
        System.out.println("PASS " + checks + " moment deletion checks");
    }
}
